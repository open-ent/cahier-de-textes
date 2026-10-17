#!/bin/bash

MVN_OPTS="-Duser.home=/var/maven -T 4"

if [ ! -e node_modules ]
then
  mkdir node_modules
fi

# If DEBUG env var is set to "true" then set -x to enable debug mode
if [ "$DEBUG" == "true" ]; then
	set -x
	EDIFICE_CLI_DEBUG_OPTION="--debug"
else
	EDIFICE_CLI_DEBUG_OPTION=""
fi

case `uname -s` in
  MINGW*)
    USER_UID=1000
    GROUP_UID=1000
    ;;
  *)
    if [ -z ${USER_UID:+x} ]
    then
      USER_UID=`id -u`
      GROUP_GID=`id -g`
    fi
esac

init() {
  me=`id -u`:`id -g`
  echo "DEFAULT_DOCKER_USER=$me" > .env

  # If CLI_VERSION is empty set to latest
  if [ -z "$CLI_VERSION" ]; then
    CLI_VERSION="latest"
  fi
  # Create a build.compose.yaml file from following template
  cat <<EOF > build.compose.yaml
services:
  edifice-cli:
    image: opendigitaleducation/edifice-cli:$CLI_VERSION
    user: "$DEFAULT_DOCKER_USER"
EOF
  # Copy /root/edifice from edifice-cli container to host machine
  docker compose -f build.compose.yaml create edifice-cli
  docker compose -f build.compose.yaml cp edifice-cli:/root/edifice ./edifice
  docker compose -f build.compose.yaml rm -fsv edifice-cli
  rm -f build.compose.yaml
  chmod +x edifice
  ./edifice version $EDIFICE_CLI_DEBUG_OPTION
}

clean () {
  docker compose run --rm maven mvn $MVN_OPT clean
}

buildNode () {
  #jenkins
  echo "[buildNode] Get branch name from jenkins env..."
  if [ ! -z "$FRONT_BRANCH" ]; then
    echo "[buildNode] Get tag name from jenkins param... $FRONT_BRANCH"
    BRANCH_NAME="$FRONT_BRANCH"
  else
    BRANCH_NAME=`echo $GIT_BRANCH | sed -e "s|origin/||g"`
  fi
  if [ "$BRANCH_NAME" = "" ]; then
    echo "[buildNode] Get branch name from git..."
    BRANCH_NAME=`git branch | sed -n -e "s/^\* \(.*\)/\1/p"`
  fi
  if [ "$BRANCH_NAME" = "" ]; then
    echo "[buildNode] Branch name should not be empty!"
    exit -1
  fi

  if [ "$BRANCH_NAME" = 'master' ]; then
      echo "[buildNode] Use entcore version from package.json ($BRANCH_NAME)"
      case `uname -s` in
        MINGW*)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && npm update entcore && node_modules/gulp/bin/gulp.js build"
          ;;
        *)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && npm update entcore && node_modules/gulp/bin/gulp.js build"
      esac
  else
      # $BRANCH_NAME est la version DU MODULE cahier-de-textes (ex. 4.1.7-patched-dev), pas une
      # version d'entcore publiée — npm install entcore@$BRANCH_NAME échoue toujours (404) sur ce
      # module. package.json pin déjà la bonne version d'entcore ; s'aligner sur la CI
      # (build-and-publish.yml, job Build Frontend) qui fait juste npm install --legacy-peer-deps,
      # sans réécrire entcore.
      echo "[buildNode] Use entcore version from package.json ($BRANCH_NAME)"
      case `uname -s` in
        MINGW*)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links --legacy-peer-deps && node_modules/gulp/bin/gulp.js build"
          ;;
        *)
          docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --legacy-peer-deps && node_modules/gulp/bin/gulp.js build"
      esac
  fi
}

# Interface React (frontend/, Vite) : construite sur l'hôte puis rangée dans les ressources du module, pour que
# `./build.sh install` produise à lui seul le jar complet (AngularJS + React) — plus aucune copie à la main.
# Échec franc plutôt qu'un vieux bundle embarqué en silence. Prérequis : NODE_AUTH_TOKEN (paquets @open-ent privés).
buildReact () {
  if [ ! -f frontend/package.json ]; then
    return 0
  fi
  echo "[buildReact] Construction de l'interface React (frontend/)"
  (
    cd frontend || exit 1
    rm -rf dist
    corepack pnpm install --frozen-lockfile || exit 1
    corepack pnpm build || exit 1
    [ -f dist/public/index.js ] || { echo "[buildReact] dist/public/index.js absent : build React invalide"; exit 1; }
  ) || { echo "[buildReact] ÉCHEC"; exit 1; }
  mkdir -p src/main/resources/public
  cp -r frontend/dist/public/. src/main/resources/public/
}

install () {
  buildReact
  docker compose run --rm maven mvn $MVN_OPTS install -DskipTests
}

testNode () {
  rm -rf coverage
  rm -rf */build
  case `uname -s` in
    MINGW*)
      docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install --no-bin-links && node_modules/gulp/bin/gulp.js drop-cache &&  npm test"
      ;;
    *)
      docker compose run --rm -u "$USER_UID:$GROUP_GID" node sh -c "npm install && node_modules/gulp/bin/gulp.js drop-cache && npm test"
  esac
}

test () {
  docker compose run --rm maven mvn $MVN_OPTS test
}

publish() {
  version=`docker compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
  level=`echo $version | cut -d'-' -f3`
  case "$level" in
    *SNAPSHOT) export nexusRepository='snapshots' ;;
    *)         export nexusRepository='releases' ;;
  esac
  docker compose run --rm  maven mvn -DrepositoryId=ode-$nexusRepository -DskipTests -Dmaven.test.skip=true --settings /var/maven/.m2/settings.xml deploy
}

publishNexus() {
  version=`docker compose run --rm maven mvn $MVN_OPTS help:evaluate -Dexpression=project.version -q -DforceStdout`
  level=`echo $version | cut -d'-' -f3`
  case "$level" in
    *SNAPSHOT) export nexusRepository='snapshots' ;;
    *)         export nexusRepository='releases' ;;
  esac
  docker compose run --rm  maven mvn $MVN_OPTS -DrepositoryId=ode-$nexusRepository -Durl=$repo -DskipTests -Dmaven.test.skip=true --settings /var/maven/.m2/settings.xml deploy
}

if [ ! -e .env ]; then
  init
fi

for param in "$@"
do
  case $param in
    init)
      init
      ;;
    clean)
      clean
      ;;
    buildNode)
      buildNode
      ;;
    buildMaven)
      install
      ;;
    install)
      buildNode && install
      ;;
    publishNexus)
        publishNexus
        ;;
    publish)
      publish
      ;;
    test)
      testNode ; test
      ;;
    testNode)
      testNode
      ;;
    testMaven)
      test
      ;;
    *)
      echo "Invalid argument : $param"
  esac
  if [ ! $? -eq 0 ]; then
    exit 1
  fi
done

