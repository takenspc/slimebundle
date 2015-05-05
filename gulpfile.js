"use strict";
var browserify = require("browserify");
var gulp = require("gulp");
var source = require("vinyl-source-stream");

gulp.task("scripts", function() {
    var b = browserify({
        entries: "./src/main.js",
        debug: true
    });
    b.exclude("fs");
    b.exclude("system");
    b.exclude("webpage");

    return b.bundle()
        .pipe(source("slimebundle.js"))
        .pipe(gulp.dest("./"));
});

gulp.task("default", ["scripts"]);
