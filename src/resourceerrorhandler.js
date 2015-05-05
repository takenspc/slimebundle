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
