"use strict";
var gulp = require("gulp");
var concat = require("gulp-concat");

var scripts = [
    "src/util.js",
    "src/tsvlogger.js",
    "src/pagerenderer.js",
    "src/resourceerrorhandler.js",
    "src/sameoriginresourcesaver.js",
    "src/main.js"
];

gulp.task("concat-scripts", function() {
    return gulp.src(scripts)
        .pipe(concat("slimebundle.js"))
        .pipe(gulp.dest("."));
});

gulp.task("default", ["concat-scripts"]);
