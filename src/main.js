"use strict";

var webpage = require("webpage");
var program = require("../lib/commander.js");
var Logger = require("./tsvlogger.js");
var Renderer = require("./pagerenderer.js");
var Handler = require("./resourceerrorhandler.js");
var Saver = require("./sameoriginresourcesaver.js");

// Commander
(function() {
    function toRegExp(item) {
        return new RegExp(item);
    }

    function list(val) {
        return val.split(",").map(toRegExp);
    }

    program
        .version("0.0.1")
        .option("-u, --url <string>", "The URL of the page.", String)
        .option("-i, --width <n>", "The width of the viewport.", parseInt)
        .option("-e, --height <n>", "The height of the viewport.", parseInt)
        .option("-t, --timeout <n>", "The timeout (ms). The default is 5000.", parseInt)
        .option("-s, --skip-overwrite", "Specify if you want to avoid overwriting previously downloaded files.")
        .option("-c, --capture-content <regexp,regexp,..>", "The comma separated regexps matching content types of resources for which you want to retrieve the content. The default is \".+\". <http://docs.slimerjs.org/current/api/webpage.html#webpage-capturecontent>", list, [/.+/])
        .option("--skip-saving", "Specify if you want to skip saving resources.")
        .option("--skip-error-resources", "Specify if you want to skip logging error resources.")
        .option("--skip-screenshot", "Specify if you want to skip capturing screenshot.")
        .parse(process.argv);
})();

// config
var page = webpage.create();
page.viewportSize = {
    width: program.width || 640,
    height: program.height || 480
};
page.settings.resourceTimeout = program.timeout;

// Logging Error Resources
var logger = new Logger();
if (!program.skipErrorResources) {
    var handler = new Handler(page, logger, {});
}

// Capturing screen shots
var renderer;
if (!program.skipScreenshot) {
    renderer = new Renderer(page, logger, {});
}

// Saving same origin resources
if (!program.skipSaving) {
    // captureContent: http://docs.slimerjs.org/0.9/api/webpage.html#capturecontent
    var options = {
        overwrite: !program.skipOverwrite,
        captureContent: program.captureContent
    };
    var saver = new Saver(page, logger, options);
}

// main
page.open(program.url, function(status) {
    if (status === "success") {
        setTimeout(function() {
            if (renderer) {
                renderer.render();
            }
            phantom.exit();
        }, 200);
    } else {
        phantom.exit(1);
    }
});
