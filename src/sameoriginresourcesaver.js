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
                // http://docs.slimerjs.org/0.9/api/webpage.html#webpage-onresourcereceived
                // > Note about the ``body`` property: by default, the body property is filled only for the resource
                // > that corresponds to the main html page. For other resources, it will be empty.
                if (res.body.length === 0) {
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
