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
