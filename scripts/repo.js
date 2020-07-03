﻿//engine: JScript
//uname: repo
//dname: Репозитарий аддинов
//debug: no
//descr: Скрипт для организации работы с репозитариями аддинов
//author: orefkov
//help: inplace
//addin: global
exports.__esModule = true;
/*@
Скрипт организует работу с репозитариями аддинов снегопата. Снегопат поддерживает работу
с двумя репозитариями аддинов - официальный репозитарий, в котором размещаются официальные
аддины и который синхронизируется с центральным сайтом, и пользовательский репозитарий,
куда пользователь может помещать свои или сторонние аддины, не входящие в официальный
репозитарий.

Данный скрипт составляет список аддинов в этих репозитариях.
Список строится путём:
- анализа файлов *.js в корневой папке репозитария.
- анализа файлов описаний аддинов *.info в папке list репозитария.

При анализе файла описания аддина информация берется из тэгов вида `имяТэга: значение тэга`.
В одной строке текста может быть размещен один тэг. Если в строке нет тэга, анализ прекращается.
Неизвестные теги просто пропускаются. При анализе файлов скриптов тэги должны быть комментариями `//`.
Обрабатываются следующие тэги:
- load - Строка загрузки аддина. Подстрока `<repo>` заменяется на тип репозитария: либо `<addins>`, либо `<custom>`.
  При загрузке аддина `<addins>` и `<custom>` заменяются на реальный путь к соответствующему репозитарию.
  Для аддинов-скриптов это поле не обрабатывается, а строка загрузки формируется автоматически.
  Для остальных аддинов - это обязательное поле, так как в общем случае снегопат никак не интерпретирует
  состав строки загрузки, а просто передаёт её загрузчику аддинов.
- uname - обязательное поле, уникальное имя аддина.
- dname - отображаемое имя аддина.
- descr - краткое описание аддина.
- author - автор.
- version - версия.
- help - размещение файла документации к аддину. Если значение равно "inplace" - документация извлекается из
  самого аддина, из комментариев. Иначе это должен быть путь к файлу документации, относительно папки
  файла скрипта или описания аддина.
- www - ссылка на страницу аддина в интернете.
- hidden - если значение равно yes, то аддин не показывается в списке аддинов, однако в справке
  присутствует.

При анализе файлов .info в каталоге list первая строка файла может принимать дополнительные значения:
- script: путь к файлу скрипта. Дальнейшая обработка этого файла прекращается, а анализируется файл скрипта:
  тэги в нём должны быть закомментированы, inplace справка извлекается из комментариев, строка загрузки
  формируется автоматически.
- file: путь к файлу описания аддина. Дальнейшая обработка переключается на указанный файл, он обрабатывается
  как info-файл: тэги без комментариев, обязательно наличие тэга load.

Если этих директив нет - обрабатывается сам info-файл, аддин отображается в корне репозитария.
Если же произошло переключение на другой файл по одной из этих директив, в репозитарии аддин отображается
в директории, соответствующей этому файлу.
@*/
/// <reference path="../snegopat.d.ts"/>
/// <reference path="../v8.d.ts"/>
global.connectGlobals(SelfScript);
var helpsys = require("./help");
;
function addinInfo() {
    return {
        tags: { uname: "", dname: "", descr: "", author: "", version: "", help: "", www: "", hidden: "" },
        load: "", isStd: false, helpPath: "",
        name: function () {
            return this.tags.dname.length ? this.tags.dname : this.tags.uname;
        }
    };
}
;
function sortAddinsFolder(folder) {
    folder.addins.sort(function (a, b) { return a.name().toLowerCase().localeCompare(b.name().toLowerCase()); });
    folder.childs.sort(function (a, b) { return a.name.toLowerCase().localeCompare(b.name.toLowerCase()); });
    for (var k in folder.childs)
        sortAddinsFolder(folder.childs[k]);
}
var RepoSystem = /** @class */ (function () {
    function RepoSystem(name, parent, typeOfRepo, rootFolder, baseFolder, maskForAuto, isStd) {
        this.root = { name: name, basePath: baseFolder, path: rootFolder, typeOfRepo: typeOfRepo, childs: [], addins: [] };
        this.processRootFolder(maskForAuto, isStd);
        this.processListFolder();
        parent.childs.push(this.root);
    }
    RepoSystem.prototype.processRootFolder = function (maskForAuto, isStd) {
        var files = FindFiles(this.root.path, maskForAuto, false);
        for (var idx = 0; idx < files.Count(); idx++) {
            var file = files.Get(idx);
            if (file.Exist() && file.IsFile()) {
                this.processScriptFile(file, this.root, isStd);
            }
        }
    };
    RepoSystem.prototype.processScriptFile = function (file, folder, isStd) {
        var ai = addinInfo();
        var td = v8New("TextDocument");
        td.Read(file.FullName);
        for (var l = 1; l <= td.LineCount(); l++) {
            var line = td.GetLine(l);
            if (/^\/\/(\w+)\:[ \t]*(.*)/.exec(line)) {
                if (RegExp.$1 in ai.tags)
                    ai.tags[RegExp.$1] = RegExp.$2.replace(/\s+$/, "");
            }
            else
                break;
        }
        td = null;
        if (ai.tags.uname.length) {
            ai.load = isStd ? "" : "script:<" + this.root.typeOfRepo + ">" + file.FullName.substr(folder.basePath.length);
            ai.isStd = isStd;
            folder.addins.push(ai);
            if (ai.tags.help.length)
                ai.helpPath = folder.path + (ai.tags.help == "inplace" ? file.Name : ai.tags.help);
        }
    };
    RepoSystem.prototype.processListFolder = function () {
        var files = FindFiles(this.root.path + "list\\", "*.info", false);
        for (var idx = 0; idx < files.Count(); idx++) {
            var file = files.Get(idx);
            if (file.Exist() && file.IsFile()) {
                var td = v8New("TextDocument");
                td.Read(file.FullName);
                if (td.LineCount()) {
                    var line = td.GetLine(1);
                    if (line.indexOf("script:") == 0) {
                        file = v8New("File", this.root.path + line.substr(7).replace(/^\s+|\s+$/g, ""));
                        if (file.Exist() && file.IsFile())
                            this.processScriptFile(file, this.createFolder(file.Path), false);
                    }
                    else {
                        var folder = this.root;
                        if (line.indexOf("file:") == 0) {
                            file = v8New("File", this.root.path + line.substr(5).replace(/^\s+|\s+$/g, ""));
                            if (file.Exist() && file.IsFile()) {
                                td.Read(file.FullName);
                                folder = this.createFolder(file.Path);
                            }
                            else
                                continue;
                        }
                        var ai = addinInfo();
                        for (var l = 1; l <= td.LineCount(); l++) {
                            var line = td.GetLine(l);
                            if (/^(\w+)\:[ \t]*(.*)/.exec(line)) {
                                if (RegExp.$1 in ai.tags)
                                    ai.tags[RegExp.$1] = RegExp.$2.replace(/\s+$/, "");
                                else if (RegExp.$1 == "load")
                                    ai.load = RegExp.$2.replace("<repo>", "<" + this.root.typeOfRepo + ">");
                            }
                            else
                                break;
                        }
                        td = null;
                        if (ai.tags.uname.length && ai.load.length) {
                            folder.addins.push(ai);
                            if (ai.tags.help.length)
                                ai.helpPath = folder.path + (ai.tags.help == "inplace" ? file.Name : ai.tags.help);
                        }
                    }
                }
            }
        }
    };
    RepoSystem.prototype.createFolder = function (path) {
        var folders = path.substr(this.root.path.length).split("\\");
        var res = this.root;
        for (var i in folders) {
            var folder = folders[i].toLowerCase();
            if (folder.length) {
                var found = null;
                for (var k in res.childs) {
                    if (folder == res.childs[k].name.toLowerCase()) {
                        found = res.childs[k];
                        break;
                    }
                }
                if (!found) {
                    found = {
                        basePath: res.basePath, name: folders[i], path: res.path + folders[i] + "\\", typeOfRepo: res.typeOfRepo, addins: [], childs: []
                    };
                    res.childs.push(found);
                }
                res = found;
            }
        }
        return res;
    };
    return RepoSystem;
}());
;
var Reposytory = /** @class */ (function () {
    function Reposytory() {
        this.root = { name: "", basePath: "", path: "", typeOfRepo: "", addins: [], childs: [] };
        this.addinsByLoadStr = {};
        this.addinsByUname = {};
        var c = new RepoSystem("Пользовательские аддины", this.root, "custom", env.pathes.custom, env.pathes.custom, "*.js", false);
        var o = new RepoSystem("Официальные аддины", this.root, "addins", env.pathes.addins, env.pathes.addins, "*.js", false);
        new RepoSystem("<Стандартные скрипты>", o.root, "core", env.pathes.core + "scripts\\", env.pathes.core, "*", true);
        new RepoSystem("<Встроенные аддины>", o.root, "core", env.pathes.core + "engine\\", env.pathes.core, "*.as", true);
        sortAddinsFolder(c.root);
        sortAddinsFolder(o.root);
        var al = this.addinsByLoadStr, au = this.addinsByUname;
        (function processRepo(repoFolder) {
            for (var i in repoFolder.childs)
                processRepo(repoFolder.childs[i]);
            for (var a in repoFolder.addins) {
                var ai = repoFolder.addins[a];
                au[ai.tags.uname] = ai;
                if (!ai.isStd)
                    al[ai.load.toLowerCase()] = ai;
            }
        })(this.root);
        helpsys.getHelpSystem().createAddinsDocs(this.root);
    }
    Reposytory.prototype.findByUname = function (uname) {
        return this.addinsByUname[uname];
    };
    Reposytory.prototype.findByLoadStr = function (ls) {
        return this.addinsByLoadStr[ls.toLowerCase()];
    };
    return Reposytory;
}());
;
var repo;
function getRepo() {
    if (!repo)
        repo = new Reposytory;
    return repo;
}
exports.getRepo = getRepo;
