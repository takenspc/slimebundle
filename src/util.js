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
