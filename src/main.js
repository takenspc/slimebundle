(function() {
    "use strict";
    var webpage = require("webpage");
    var system = require("system");
    var args = system.args;
    if (args.length < 2 || args.length > 5) {
        console.log("Download and save same origin resources of the given web page using SlimerJS.");
        console.log("Usage: " + system.platform + " " + args[0] + " URL width height");
        phantom.exit(-1);
        return;
    }

    if (system.platform !== "slimerjs") {
        console.warn("This script depends on SlimerJS specific APIs. Please use SlimerJS.");
    }

    var url = args[1];
    var width = args.length > 2 ? args[2] : 1024;
    var height = args.length > 3 ? args[3] : 768;

    var page = webpage.create();
    page.viewportSize = {
        width: width,
        height: height
    };
    var logger = new TSVLogger();
    var handler = new ResourceErrorHandler(page, logger, {});
    var renderer = new PageRenderer(page, logger, {});
    // captureContent: http://docs.slimerjs.org/0.9/api/webpage.html#capturecontent
    var options = {
        overwrite: true,
        captureContent: [ /.+/ ]
    };
    var saver = new SameOriginResourcesSaver(page, logger, options);
    page.open(url, function(status) {
        if (status === "success") {
            window.setTimeout(function() {
                renderer.render();
                phantom.exit();
            }, 200);
        } else {
            phantom.exit(1);
        }
    });
})();
