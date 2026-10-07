import {model} from 'entcore';
import {structureService} from '../services';
import {
    Audience,
    Audiences, Course,
    Courses,
    DateUtils,
    Homeworks,
    Sessions,
    Student,
    Students,
    Subjects, Teacher,
    Teachers
} from './index';
import {Eventer} from 'entcore-toolkit';
import {Personnels} from './Personnel';
import {SessionTypes} from './session';
import {Group, Groups} from "./group";
import {ArrayUtils} from "../utils/array.utils";
import {UserUtils} from "../utils/user.utils";

declare let window: any;

export class Structure {
    id: string;
    name: string;
    courses: Courses;
    sessions: Sessions;
    homeworks: Homeworks;
    subjects: Subjects;
    audiences: Audiences;
    teachers: Teachers;
    students: Students;
    groups: Groups;
    personnels: Personnels;
    eventer: Eventer = new Eventer();
    types: SessionTypes;

    /**
     * Structure constructor. Can take an id and a name in parameter
     * @param id structure id
     * @param name structure name
     */
    constructor(id?: string, name?: string) {
        if (typeof id === 'string') {
            this.id = id;
        }
        if (typeof name === 'string') {
            this.name = name;
        }
        this.types = new SessionTypes(this.id);
        this.audiences = new Audiences();
        this.courses = new Courses(this);
        this.sessions = new Sessions(this);
        this.homeworks = new Homeworks(this);
        this.teachers = new Teachers();
        this.personnels = new Personnels();
        this.students = new Students(this);
        this.groups = new Groups();
    }

    /**
     * Synchronize structure information. Audiences and Subjects need to be synchronized to start courses
     * synchronization.
     * @returns {Promise<any>|Promise}
     */
    async sync() {
        const promises: Promise<void>[] = [];
        promises.push(this.types.sync());
        promises.push(this.audiences.sync(this.id, !UserUtils.amIStudentOrParent()));
        promises.push(this.teachers.sync(this));
        promises.push(this.personnels.sync(this));
        await Promise.all(promises).then(async () => {
            window.audiences = this.audiences;
        });
    }

    addStudent(newStudent: Student): void {
        if (!this.students) this.students = new Students(this);

        let student: Student = this.students.get(newStudent.id);
        let audience: Audience = this.audiences.getAudienceFromStudent(newStudent);
        let group: Group = this.groups.getGroupsFromStudent(newStudent);

        const setStudentData = (currentStudent: Student): void => {
            if (audience) currentStudent.addAudience(audience);
            if (group) currentStudent.addGroup(group);
        }
        if (student) {
            setStudentData(student);
            return;
        }
        setStudentData(newStudent);
        this.students.add(newStudent);
    }

    addGroup(newGroup: Group): void {
        if (!this.groups) this.groups = new Groups();
        let group: Group = this.groups.get(newGroup.id_classe);
        if (group) {
            group.addGroupIds(newGroup.id_groups);
            group.addGroupNames(newGroup.name_groups);
            return;
        }
        this.groups.add(newGroup);
    }

    setCourses(courses: Course[]): void {
        this.courses = new Courses(this).set(courses);
        this.courses.all.forEach((course: Course) => {
            let classNames = course.classNames || [];
            let groupNames = course.groupNames || [];
            let teacherIds = course.teacherIds || [];
            course.audiences.set(this.audiences.getAudiences([...classNames, ...groupNames]));
            course.teachers.set(this.teachers.getTeachers(teacherIds));
            course.init(this);
        });
    }
}

export class Structures {
    all: Structure[];

    constructor(arr?: Structure[]) {
        this.all = arr ? arr : [];
    }

    setStructures(structures: Structure[]): void {
        this.all = structures;
    }

    /**
     * Établissements proposés à l'utilisateur.
     *
     * Aux rattachements de session s'ajoutent ceux où il détient une **habilitation
     * d'inspection**. Le périmètre d'un inspecteur est défini par ses habilitations, alors qu'il
     * n'est le plus souvent rattaché qu'à son service académique : sans cet ajout, la vue
     * d'inspection resterait vide pour lui, puisqu'elle travaille sur la structure courante.
     */
    async sync(): Promise<void> {
        // Les habilitations sont chargées AVANT de bâtir la liste : c'est `getUserStructure()` qui
        // fusionne rattachements et établissements habilités, afin que ce modèle et le sélecteur
        // d'établissement (directive `selectStructure`) partagent la même source.
        await structureService.syncInspectionStructures();
        structureService.getUserStructure()
            .filter((s: Structure) => !this.get(s.id))
            .forEach((s: Structure) => this.all.push(s));
    }

    /**
     * Returns first structure occurrence in the class
     * @returns {Structure} first structure contained in 'all' array
     */
    first(): Structure {
        return this.all[0];
    }

    get = (structureId: string): Structure => this.all.find((structure: Structure) => structure.id === structureId);

    getAudiences(): Audience[] {
        let audiences: Audience[][] = this.all.map((structure: Structure) => structure.audiences.all);
        return ArrayUtils.propertyDistinct(ArrayUtils.flat(audiences), "id");
    }

    getStudents(): Student[] {
        let students: Student[][] = this.all.map((structure: Structure) => structure.students.all);
        return ArrayUtils.propertyDistinct(ArrayUtils.flat(students), "id");
    }

    /**
     * Returns current structure we are using with window.structure
     * @returns {Structure} structure
     */
    getCurrentStructure(): Structure {
        if (window.structure) return this.get(window.structure.id);
    }

    filterByStudents = (studentId: string): Structure[] =>
        this.all.filter((structure: Structure) => structure.students.get(studentId));
}