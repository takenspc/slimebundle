(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";

var webpage = require("webpage");
var system = require("system");
var Logger = require("./tsvlogger.js");
var Renderer = require("./pagerenderer.js");
var Handler = require("./resourceerrorhandler.js");
var Saver = require("./sameoriginresourcesaver.js");

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

var logger = new Logger();
var handler = new Handler(page, logger, {});
var renderer = new Renderer(page, logger, {});
// captureContent: http://docs.slimerjs.org/0.9/api/webpage.html#capturecontent
var options = {
    overwrite: true,
    captureContent: [ /.+/ ]
};
var saver = new Saver(page, logger, options);
page.open(url, function(status) {
    if (status === "success") {
        setTimeout(function() {
            renderer.render();
            phantom.exit();
        }, 200);
    } else {
        phantom.exit(1);
    }
});

},{"./pagerenderer.js":2,"./resourceerrorhandler.js":3,"./sameoriginresourcesaver.js":4,"./tsvlogger.js":5,"system":undefined,"webpage":undefined}],2:[function(require,module,exports){
/*
 * Capture a screenshot of a page
 */
var Util = require("./util.js");

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

module.exports = PageRenderer;

},{"./util.js":6}],3:[function(require,module,exports){
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

module.exports = ResourceErrorHandler;

},{}],4:[function(require,module,exports){
/*
 * Saving resources
 */
var Util = require("./util.js");

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

module.exports = SameOriginResourcesSaver;

},{"./util.js":6}],5:[function(require,module,exports){
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

module.exports = TSVLogger;

},{}],6:[function(require,module,exports){
/*
 * Utility methods on Path and URL
 */
var fs = require("fs");
var Util = (function() {
    "use strict";
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

module.exports = Util;

},{"fs":undefined}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvbWFpbi5qcyIsInNyYy9wYWdlcmVuZGVyZXIuanMiLCJzcmMvcmVzb3VyY2VlcnJvcmhhbmRsZXIuanMiLCJzcmMvc2FtZW9yaWdpbnJlc291cmNlc2F2ZXIuanMiLCJzcmMvdHN2bG9nZ2VyLmpzIiwic3JjL3V0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbnZhciB3ZWJwYWdlID0gcmVxdWlyZShcIndlYnBhZ2VcIik7XG52YXIgc3lzdGVtID0gcmVxdWlyZShcInN5c3RlbVwiKTtcbnZhciBMb2dnZXIgPSByZXF1aXJlKFwiLi90c3Zsb2dnZXIuanNcIik7XG52YXIgUmVuZGVyZXIgPSByZXF1aXJlKFwiLi9wYWdlcmVuZGVyZXIuanNcIik7XG52YXIgSGFuZGxlciA9IHJlcXVpcmUoXCIuL3Jlc291cmNlZXJyb3JoYW5kbGVyLmpzXCIpO1xudmFyIFNhdmVyID0gcmVxdWlyZShcIi4vc2FtZW9yaWdpbnJlc291cmNlc2F2ZXIuanNcIik7XG5cbnZhciBhcmdzID0gc3lzdGVtLmFyZ3M7XG5pZiAoYXJncy5sZW5ndGggPCAyIHx8IGFyZ3MubGVuZ3RoID4gNSkge1xuICAgIGNvbnNvbGUubG9nKFwiRG93bmxvYWQgYW5kIHNhdmUgc2FtZSBvcmlnaW4gcmVzb3VyY2VzIG9mIHRoZSBnaXZlbiB3ZWIgcGFnZSB1c2luZyBTbGltZXJKUy5cIik7XG4gICAgY29uc29sZS5sb2coXCJVc2FnZTogXCIgKyBzeXN0ZW0ucGxhdGZvcm0gKyBcIiBcIiArIGFyZ3NbMF0gKyBcIiBVUkwgd2lkdGggaGVpZ2h0XCIpO1xuICAgIHBoYW50b20uZXhpdCgtMSk7XG4gICAgcmV0dXJuO1xufVxuXG5pZiAoc3lzdGVtLnBsYXRmb3JtICE9PSBcInNsaW1lcmpzXCIpIHtcbiAgICBjb25zb2xlLndhcm4oXCJUaGlzIHNjcmlwdCBkZXBlbmRzIG9uIFNsaW1lckpTIHNwZWNpZmljIEFQSXMuIFBsZWFzZSB1c2UgU2xpbWVySlMuXCIpO1xufVxuXG52YXIgdXJsID0gYXJnc1sxXTtcbnZhciB3aWR0aCA9IGFyZ3MubGVuZ3RoID4gMiA/IGFyZ3NbMl0gOiAxMDI0O1xudmFyIGhlaWdodCA9IGFyZ3MubGVuZ3RoID4gMyA/IGFyZ3NbM10gOiA3Njg7XG5cbnZhciBwYWdlID0gd2VicGFnZS5jcmVhdGUoKTtcbnBhZ2Uudmlld3BvcnRTaXplID0ge1xuICAgIHdpZHRoOiB3aWR0aCxcbiAgICBoZWlnaHQ6IGhlaWdodFxufTtcblxudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoKTtcbnZhciBoYW5kbGVyID0gbmV3IEhhbmRsZXIocGFnZSwgbG9nZ2VyLCB7fSk7XG52YXIgcmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIocGFnZSwgbG9nZ2VyLCB7fSk7XG4vLyBjYXB0dXJlQ29udGVudDogaHR0cDovL2RvY3Muc2xpbWVyanMub3JnLzAuOS9hcGkvd2VicGFnZS5odG1sI2NhcHR1cmVjb250ZW50XG52YXIgb3B0aW9ucyA9IHtcbiAgICBvdmVyd3JpdGU6IHRydWUsXG4gICAgY2FwdHVyZUNvbnRlbnQ6IFsgLy4rLyBdXG59O1xudmFyIHNhdmVyID0gbmV3IFNhdmVyKHBhZ2UsIGxvZ2dlciwgb3B0aW9ucyk7XG5wYWdlLm9wZW4odXJsLCBmdW5jdGlvbihzdGF0dXMpIHtcbiAgICBpZiAoc3RhdHVzID09PSBcInN1Y2Nlc3NcIikge1xuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmVuZGVyZXIucmVuZGVyKCk7XG4gICAgICAgICAgICBwaGFudG9tLmV4aXQoKTtcbiAgICAgICAgfSwgMjAwKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBwaGFudG9tLmV4aXQoMSk7XG4gICAgfVxufSk7XG4iLCIvKlxuICogQ2FwdHVyZSBhIHNjcmVlbnNob3Qgb2YgYSBwYWdlXG4gKi9cbnZhciBVdGlsID0gcmVxdWlyZShcIi4vdXRpbC5qc1wiKTtcblxuZnVuY3Rpb24gUGFnZVJlbmRlcmVyKHBhZ2UsIGxvZ2dlciwgb3B0aW9ucykge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIHRoaXMucGFnZSA9IHBhZ2U7XG4gICAgdGhpcy5sb2dnZXIgPSBsb2dnZXI7XG4gICAgdGhpcy5vcHRpb25zID0ge1xuICAgICAgICBmaWxlbmFtZTogKG9wdGlvbnMgJiYgb3B0aW9ucy5maWxlbmFtZSkgfHwgbnVsbCxcbiAgICAgICAgZXh0ZW5zaW9uOiBcIi5wbmdcIlxuICAgIH07XG59XG5cblxuUGFnZVJlbmRlcmVyLnByb3RvdHlwZSA9IChmdW5jdGlvbigpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcbiAgICByZXR1cm4ge1xuICAgICAgICByZW5kZXI6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciB1cmwgPSB0aGlzLnBhZ2UudXJsO1xuICAgICAgICAgICAgdmFyIGZpbGVuYW1lID0gdGhpcy5vcHRpb25zLmZpbGVuYW1lO1xuICAgICAgICAgICAgaWYgKGZpbGVuYW1lID09PSBudWxsKSB7XG4gICAgICAgICAgICAgICAgZmlsZW5hbWUgPSBVdGlsLmdldFBhdGhGcm9tVVJMKHVybCk7XG4gICAgICAgICAgICAgICAgZmlsZW5hbWUgKz0gdGhpcy5vcHRpb25zLmV4dGVuc2lvbjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHRoaXMucGFnZS5yZW5kZXIoZmlsZW5hbWUpO1xuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gUGFnZVJlbmRlcmVyO1xuIiwiLypcbiAqIExvZ2dpbmcgTmV0d29yayBFcnJvciBSZXNvdXJjZXNcbiAqL1xuZnVuY3Rpb24gUmVzb3VyY2VFcnJvckhhbmRsZXIocGFnZSwgbG9nZ2VyLCBvcHRpb25zKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG4gICAgdGhpcy5wYWdlID0gcGFnZTtcbiAgICB0aGlzLmxvZ2dlciA9IGxvZ2dlcjtcbiAgICB0aGlzLm9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICAgIHRoaXMuaW5pdCgpO1xufVxuXG5SZXNvdXJjZUVycm9ySGFuZGxlci5wcm90b3R5cGUgPSAoZnVuY3Rpb24oKSB7XG4gICAgXCJ1c2Ugc3RyaWN0XCI7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5wYWdlLm9uUmVzb3VyY2VFcnJvciA9IHRoaXMub25SZXNvdXJjZUVycm9yLmJpbmQodGhpcyk7XG4gICAgICAgICAgICB0aGlzLnBhZ2Uub25SZXNvdXJjZVRpbWVvdXQgPSB0aGlzLm9uUmVzb3VyY2VUaW1lb3V0LmJpbmQodGhpcyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgb25SZXNvdXJjZUVycm9yOiBmdW5jdGlvbiAoZSkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIubG9nKHRoaXMucGFnZS51cmwsIFwiZXJyb3JcIiwgZS5lcnJvckNvZGUsIGUuZXJyb3JTdHJpbmcsIGUudXJsKTtcbiAgICAgICAgfSxcblxuICAgICAgICBvblJlc291cmNlVGltZW91dDogZnVuY3Rpb24gKHJlcSkge1xuICAgICAgICAgICAgdGhpcy5sb2dnZXIubG9nKHRoaXMucGFnZS51cmwsIFwidGltZW91dFwiLCByZXEuZXJyb3JDb2RlLCByZXEuZXJyb3JTdHJpbmcsIHJlcS51cmwpO1xuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzb3VyY2VFcnJvckhhbmRsZXI7XG4iLCIvKlxuICogU2F2aW5nIHJlc291cmNlc1xuICovXG52YXIgVXRpbCA9IHJlcXVpcmUoXCIuL3V0aWwuanNcIik7XG5cbmZ1bmN0aW9uIFNhbWVPcmlnaW5SZXNvdXJjZXNTYXZlcihwYWdlLCBsb2dnZXIsIG9wdGlvbnMpIHtcbiAgICBcInVzZSBzdHJpY3RcIjtcbiAgICB0aGlzLnBhZ2UgPSBwYWdlO1xuICAgIHRoaXMubG9nZ2VyID0gbG9nZ2VyO1xuICAgIHRoaXMub3B0aW9ucyA9IHtcbiAgICAgICAgb3ZlcndyaXRlOiAhIShvcHRpb25zICYmIG9wdGlvbnMub3ZlcndyaXRlKSxcbiAgICAgICAgY2FwdHVyZUNvbnRlbnQ6IChvcHRpb25zICYmIG9wdGlvbnMuY2FwdHVyZUNvbnRlbnQpIHx8IFsvLisvXVxuICAgIH07XG4gICAgdGhpcy5yZXNvdWNlcyA9IHt9O1xuICAgIHRoaXMuaW5pdCgpO1xufVxuXG5TYW1lT3JpZ2luUmVzb3VyY2VzU2F2ZXIucHJvdG90eXBlID0gKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIHJldHVybiB7XG4gICAgICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMucGFnZS5jYXB0dXJlQ29udGVudCA9IHRoaXMub3B0aW9ucy5jYXB0dXJlQ29udGVudDtcbiAgICAgICAgICAgIHRoaXMucGFnZS5vblJlc291cmNlUmVjZWl2ZWQgPSB0aGlzLm9uUmVzb3VyY2VSZWNlaXZlZC5iaW5kKHRoaXMpO1xuICAgICAgICB9LFxuXG4gICAgICAgIG9uUmVzb3VyY2VSZWNlaXZlZDogZnVuY3Rpb24gKHJlcykge1xuICAgICAgICAgICAgaWYgKHJlcy5zdGFnZSA9PT0gXCJzdGFydFwiIHx8IHJlcy5zdGF0dXMgIT09IDIwMCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciB1cmwgPSByZXMudXJsO1xuICAgICAgICAgICAgaWYgKFV0aWwuY29tcGFyZU9yaWdpbih0aGlzLnBhZ2UudXJsLCB1cmwpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHBhdGggPSBVdGlsLmdldFBhdGhGcm9tVVJMKHVybCk7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLm9wdGlvbnMub3ZlcndyaXRlICYmIFV0aWwuZXhpc3RzUGF0aChwYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIHByZXBhcmUgY2h1bmsgZG93bmxvYWRcbiAgICAgICAgICAgICAgICB2YXIgaWQgPSByZXMuaWQ7XG4gICAgICAgICAgICAgICAgaWYgKCF0aGlzLnJlc291Y2VzLmhhc093blByb3BlcnR5KGlkKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnJlc291Y2VzW2lkXSA9IFtdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0aGlzLnJlc291Y2VzW2lkXS5wdXNoKHJlcy5ib2R5KTtcbiAgICAgICAgICAgICAgICAvLyBodHRwOi8vZG9jcy5zbGltZXJqcy5vcmcvMC45L2FwaS93ZWJwYWdlLmh0bWwjb25yZXNvdXJjZXJlY2VpdmVkXG4gICAgICAgICAgICAgICAgaWYgKHJlcy5zdGFnZSA9PT0gXCJcIikge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIC8vIGNyZWF0ZSBwYXJlbnQgZGlyZWN0b3J5XG4gICAgICAgICAgICAgICAgVXRpbC5lbnN1cmVQYXJlbnREaXJlY3RvcnkocGF0aCk7XG4gICAgICAgICAgICAgICAgLy8gd3JpdGVcbiAgICAgICAgICAgICAgICBVdGlsLndyaXRlQ2h1bmtlZFJlc291cmNlcyhwYXRoLCB0aGlzLnJlc291Y2VzW2lkXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xufSkoKTtcblxubW9kdWxlLmV4cG9ydHMgPSBTYW1lT3JpZ2luUmVzb3VyY2VzU2F2ZXI7XG4iLCIvKlxuICogR2VuZXJpYyBMb2dnZXJcbiAqL1xuZnVuY3Rpb24gVFNWTG9nZ2VyKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xufVxuXG5UU1ZMb2dnZXIucHJvdG90eXBlID0gKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIHJldHVybiB7XG4gICAgICAgIGluaXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgfSxcblxuICAgICAgICBsb2c6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHZhciBtZXNzYWdlcyA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlcy5wdXNoKGFyZ3VtZW50c1tpXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zb2xlLmxvZyhtZXNzYWdlcy5qb2luKFwiXFx0XCIpKTtcbiAgICAgICAgfVxuICAgIH07XG59KSgpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IFRTVkxvZ2dlcjtcbiIsIi8qXG4gKiBVdGlsaXR5IG1ldGhvZHMgb24gUGF0aCBhbmQgVVJMXG4gKi9cbnZhciBmcyA9IHJlcXVpcmUoXCJmc1wiKTtcbnZhciBVdGlsID0gKGZ1bmN0aW9uKCkge1xuICAgIFwidXNlIHN0cmljdFwiO1xuICAgIHJldHVybiB7XG4gICAgICAgIGNvbXBhcmVPcmlnaW46IGZ1bmN0aW9uICh1cmwxLCB1cmwyKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5nZXRPcmlnaW4odXJsMSkgPT09IHRoaXMuZ2V0T3JpZ2luKHVybDIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGdldE9yaWdpbjogZnVuY3Rpb24gKHVybCkge1xuICAgICAgICAgICAgdmFyIG8gPSBuZXcgVVJMKHVybCk7XG4gICAgICAgICAgICByZXR1cm4gby5vcmlnaW47XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0UGF0aEZyb21VUkw6IGZ1bmN0aW9uICh1cmwpIHtcbiAgICAgICAgICAgIHZhciBvID0gbmV3IFVSTCh1cmwpO1xuICAgICAgICAgICAgdmFyIGhvc3QgPSBvLmhvc3Q7XG4gICAgICAgICAgICB2YXIgcGF0aCA9IG8ucGF0aG5hbWU7XG4gICAgICAgICAgICAvLyBYWFhcbiAgICAgICAgICAgIGlmIChwYXRoID09PSBcIlwiKSB7XG4gICAgICAgICAgICAgICAgcGF0aCA9IFwiL1wiO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gWFhYXG4gICAgICAgICAgICBpZiAocGF0aC5sYXN0SW5kZXhPZihcIi9cIikgPT09IHBhdGgubGVuZ3RoIC0gMSkge1xuICAgICAgICAgICAgICAgIHBhdGggKz0gXCJpbmRleC5odG1sXCI7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBwYXRoID0gcGF0aC5zdWJzdHJpbmcoMSk7XG4gICAgICAgICAgICB2YXIgZGlyZWN0b3JpZXMgPSBwYXRoLnNwbGl0KFwiL1wiKTtcbiAgICAgICAgICAgIGRpcmVjdG9yaWVzLnVuc2hpZnQoaG9zdCk7XG4gICAgICAgICAgICBwYXRoID0gZGlyZWN0b3JpZXMuam9pbihmcy5zZXBhcmF0b3IpO1xuICAgICAgICAgICAgcmV0dXJuIHBhdGg7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0UGFyZW50RGlyZWN0b3J5OiBmdW5jdGlvbiAocGF0aCkge1xuICAgICAgICAgICAgdmFyIGRpcmVjdG9yeSA9IHBhdGguc3BsaXQoZnMuc2VwYXJhdG9yKTtcbiAgICAgICAgICAgIGRpcmVjdG9yeS5wb3AoKTtcbiAgICAgICAgICAgIHJldHVybiBkaXJlY3Rvcnkuam9pbihmcy5zZXBhcmF0b3IpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGVuc3VyZVBhcmVudERpcmVjdG9yeTogZnVuY3Rpb24gKHBhdGgpIHtcbiAgICAgICAgICAgIHZhciBwYXJlbnQgPSB0aGlzLmdldFBhcmVudERpcmVjdG9yeShwYXRoKTtcbiAgICAgICAgICAgIGZzLm1ha2VUcmVlKHBhcmVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZXhpc3RzUGF0aDogZnVuY3Rpb24ocGF0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGZzLmV4aXN0cyhwYXRoKTtcbiAgICAgICAgfSxcblxuICAgICAgICB3cml0ZUNodW5rZWRSZXNvdXJjZXM6IGZ1bmN0aW9uKHBhdGgsIHJlc291cmNlcykge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXNvdXJjZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgICAgICBmcy53cml0ZShwYXRoLCByZXNvdXJjZXNbaV0sIGkgPT09IDAgPyBcIndiXCIgOiBcImFiXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbm1vZHVsZS5leHBvcnRzID0gVXRpbDtcbiJdfQ==
