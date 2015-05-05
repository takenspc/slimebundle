"use strict";
var browserify = require("browserify");
var gulp = require("gulp");
var source = require("vinyl-source-stream");

gulp.task("prepare-scripts", function() {
    var b = browserify({
        entries: "./node_modules/commander/index.js",
        standalone: "commander",
        transform: "phantomjsify",
        debug: true
    });
    ["system"].forEach(function(entry) {
        b.exclude(entry);
    });

    return b.bundle()
        .pipe(source("commander.js"))
        .pipe(gulp.dest("./lib/"));
});

gulp.task("scripts", function() {
    var b = browserify({
        entries: "./src/main.js",
        transform: "phantomjsify",
        debug: true
    });
    ["fs", "system", "webpage"].forEach(function(entry) {
        b.exclude(entry);
    });

    return b.bundle()
        .pipe(source("slimebundle.js"))
        .pipe(gulp.dest("./"));
});

gulp.task("default", ["scripts"]);
