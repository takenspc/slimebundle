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
