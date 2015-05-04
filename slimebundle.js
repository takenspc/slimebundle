/*
 * Utility methods on Path and URL
 */
var Util = (function() {
    "use strict";
    var fs = require("fs");
    return {
        compareOrigin: function (url1, url2) {
            return this.getOrigin(url1) === this.getOrigin(url2);
        },

        getOrigin: function (url) {
            var o = new URL(url);
            return o.origin;
        },

        getPathFromURL: function (url) {
            var o = new URL(url);
            var host = o.host;
            var path = o.pathname;
            // XXX
            if (path === "") {
                path = "/";
            }
            // XXX
            if (path.lastIndexOf("/") === path.length - 1) {
                path += "index.html";
            }
            path = path.substring(1);
            var directories = path.split("/");
            directories.unshift(host);
            path = directories.join(fs.separator);
            return path;
        },

        getParentDirectory: function (path) {
            var directory = path.split(fs.separator);
            directory.pop();
            return directory.join(fs.separator);
        },

        ensureParentDirectory: function (path) {
            var parent = this.getParentDirectory(path);
            fs.makeTree(parent);
        },

        existsPath: function(path) {
            return fs.exists(path);
        },

        writeChunkedResources: function(path, resources) {
            for (var i = 0; i < resources.length; i++) {
                fs.write(path, resources[i], i === 0 ? "wb" : "ab");
            }
        }
    };
})();

/*
 * Generic Logger
 */
function TSVLogger() {
    "use strict";
}

TSVLogger.prototype = (function() {
    "use strict";
    return {
        init: function () {
        },

        log: function () {
            var messages = [];
            for (var i = 0; i < arguments.length; i++) {
                messages.push(arguments[i]);
            }
            console.log(messages.join("\t"));
        }
    };
})();

/*
 * Capture a screenshot of a page
 */
function PageRenderer(page, logger, options) {
    "use strict";
    this.page = page;
    this.logger = logger;
    this.options = {
        filename: (options && options.filename) || null,
        extension: ".png"
    };
}


PageRenderer.prototype = (function() {
    "use strict";
    return {
        render: function () {
            var url = this.page.url;
            var filename = this.options.filename;
            if (filename === null) {
                filename = Util.getPathFromURL(url);
                filename += this.options.extension;
            }
            this.page.render(filename);
        }
    };
})();

/*
 * Logging Network Error Resources
 */
function ResourceErrorHandler(page, logger, options) {
    "use strict";
    this.page = page;
    this.logger = logger;
    this.options = options || {};
    this.init();
}

ResourceErrorHandler.prototype = (function() {
    "use strict";
    return {
        init: function () {
            this.page.onResourceError = this.onResourceError.bind(this);
            this.page.onResourceTimeout = this.onResourceTimeout.bind(this);
        },

        onResourceError: function (e) {
            this.logger.log(this.page.url, "error", e.errorCode, e.errorString, e.url);
        },

        onResourceTimeout: function (req) {
            this.logger.log(this.page.url, "timeout", req.errorCode, req.errorString, req.url);
        }
    };
})();

/*
 * Saving resources
 */
function SameOriginResourcesSaver(page, logger, options) {
    "use strict";
    this.page = page;
    this.logger = logger;
    this.options = {
        overwrite: !!(options && options.overwrite),
        captureContent: (options && options.captureContent) || [/.+/]
    };
    this.resouces = {};
    this.init();
}

SameOriginResourcesSaver.prototype = (function() {
    "use strict";
    return {
        init: function () {
            this.page.captureContent = this.options.captureContent;
            this.page.onResourceReceived = this.onResourceReceived.bind(this);
        },

        onResourceReceived: function (res) {
            if (res.stage === "start" || res.status !== 200) {
                return;
            }
            var url = res.url;
            if (Util.compareOrigin(this.page.url, url)) {
                var path = Util.getPathFromURL(url);
                if (!this.options.overwrite && Util.existsPath(path)) {
                    return;
                }
                // prepare chunk download
                var id = res.id;
                if (!this.resouces.hasOwnProperty(id)) {
                    this.resouces[id] = [];
                }
                this.resouces[id].push(res.body);
                // http://docs.slimerjs.org/0.9/api/webpage.html#onresourcereceived
                if (res.stage === "") {
                    return;
                }
                // create parent directory
                Util.ensureParentDirectory(path);
                // write
                Util.writeChunkedResources(path, this.resouces[id]);
            }
        }
    };
})();

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
