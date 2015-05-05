(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.commander = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
(function (process,global){
(function(){var module={};// DEV: This is not in a separate file since we may have node based dependencies (e.g. `which` at some point)
var system = require('system');
module.exports = function installShims () {
  // TODO: stdin uses the same API as its streams in fs but this doesn't line up with node
  // https://github.com/ariya/phantomjs/wiki/API-Reference-FileSystem
  // https://github.com/ariya/phantomjs/issues/10270
  // http://wiki.commonjs.org/wiki/System
  // process.stdin = system.stdin;

  // http://nodejs.org/api/process.html#process_process_stdout
  // https://github.com/ariya/phantomjs/blob/1.9.2/src/system.cpp#L176-L204
  process.stdout = system.stdout;
  process.stderr = system.stderr;

  // http://nodejs.org/api/process.html#process_process_exit_code
  // https://github.com/ariya/phantomjs/wiki/API-Reference-phantom#exitreturnvalue-void
  process.exit = phantom.exit;

  // https://github.com/ariya/phantomjs/wiki/API-Reference-system#wiki-system-args
  // http://nodejs.org/api/process.html#process_process_argv
  // TODO: Will this work on Windows?
  process.argv = ['phantomjs'].concat(system.args);

  // Expose process as a global
  global.process = process;
};module.exports();}());
/**
 * Module dependencies.
 */

var EventEmitter = require('events').EventEmitter;
var spawn = require('child_process').spawn;
var readlink = require('graceful-readlink').readlinkSync;
var path = require('path');
var dirname = path.dirname;
var basename = path.basename;
var fs = require('fs');

/**
 * Expose the root command.
 */

exports = module.exports = new Command();

/**
 * Expose `Command`.
 */

exports.Command = Command;

/**
 * Expose `Option`.
 */

exports.Option = Option;

/**
 * Initialize a new `Option` with the given `flags` and `description`.
 *
 * @param {String} flags
 * @param {String} description
 * @api public
 */

function Option(flags, description) {
  this.flags = flags;
  this.required = ~flags.indexOf('<');
  this.optional = ~flags.indexOf('[');
  this.bool = !~flags.indexOf('-no-');
  flags = flags.split(/[ ,|]+/);
  if (flags.length > 1 && !/^[[<]/.test(flags[1])) this.short = flags.shift();
  this.long = flags.shift();
  this.description = description || '';
}

/**
 * Return option name.
 *
 * @return {String}
 * @api private
 */

Option.prototype.name = function() {
  return this.long
    .replace('--', '')
    .replace('no-', '');
};

/**
 * Check if `arg` matches the short or long flag.
 *
 * @param {String} arg
 * @return {Boolean}
 * @api private
 */

Option.prototype.is = function(arg) {
  return arg == this.short || arg == this.long;
};

/**
 * Initialize a new `Command`.
 *
 * @param {String} name
 * @api public
 */

function Command(name) {
  this.commands = [];
  this.options = [];
  this._execs = [];
  this._allowUnknownOption = false;
  this._args = [];
  this._name = name;
}

/**
 * Inherit from `EventEmitter.prototype`.
 */

Command.prototype.__proto__ = EventEmitter.prototype;

/**
 * Add command `name`.
 *
 * The `.action()` callback is invoked when the
 * command `name` is specified via __ARGV__,
 * and the remaining arguments are applied to the
 * function for access.
 *
 * When the `name` is "*" an un-matched command
 * will be passed as the first arg, followed by
 * the rest of __ARGV__ remaining.
 *
 * Examples:
 *
 *      program
 *        .version('0.0.1')
 *        .option('-C, --chdir <path>', 'change the working directory')
 *        .option('-c, --config <path>', 'set config path. defaults to ./deploy.conf')
 *        .option('-T, --no-tests', 'ignore test hook')
 *
 *      program
 *        .command('setup')
 *        .description('run remote setup commands')
 *        .action(function() {
 *          console.log('setup');
 *        });
 *
 *      program
 *        .command('exec <cmd>')
 *        .description('run the given remote command')
 *        .action(function(cmd) {
 *          console.log('exec "%s"', cmd);
 *        });
 *
 *      program
 *        .command('teardown <dir> [otherDirs...]')
 *        .description('run teardown commands')
 *        .action(function(dir, otherDirs) {
 *          console.log('dir "%s"', dir);
 *          if (otherDirs) {
 *            otherDirs.forEach(function (oDir) {
 *              console.log('dir "%s"', oDir);
 *            });
 *          }
 *        });
 *
 *      program
 *        .command('*')
 *        .description('deploy the given env')
 *        .action(function(env) {
 *          console.log('deploying "%s"', env);
 *        });
 *
 *      program.parse(process.argv);
  *
 * @param {String} name
 * @param {String} [desc] for git-style sub-commands
 * @return {Command} the new command
 * @api public
 */

Command.prototype.command = function(name, desc, opts) {
  opts = opts || {};
  var args = name.split(/ +/);
  var cmd = new Command(args.shift());

  if (desc) {
    cmd.description(desc);
    this.executables = true;
    this._execs[cmd._name] = true;
  }

  cmd._noHelp = !!opts.noHelp;
  this.commands.push(cmd);
  cmd.parseExpectedArgs(args);
  cmd.parent = this;

  if (desc) return this;
  return cmd;
};

/**
 * Define argument syntax for the top-level command.
 *
 * @api public
 */

Command.prototype.arguments = function (desc) {
  return this.parseExpectedArgs(desc.split(/ +/));
}

/**
 * Add an implicit `help [cmd]` subcommand
 * which invokes `--help` for the given command.
 *
 * @api private
 */

Command.prototype.addImplicitHelpCommand = function() {
  this.command('help [cmd]', 'display help for [cmd]');
};

/**
 * Parse expected `args`.
 *
 * For example `["[type]"]` becomes `[{ required: false, name: 'type' }]`.
 *
 * @param {Array} args
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.parseExpectedArgs = function(args) {
  if (!args.length) return;
  var self = this;
  args.forEach(function(arg) {
    var argDetails = {
      required: false,
      name: '',
      variadic: false
    };

    switch (arg[0]) {
      case '<':
        argDetails.required = true;
        argDetails.name = arg.slice(1, -1);
        break;
      case '[':
        argDetails.name = arg.slice(1, -1);
        break;
    }

    if (argDetails.name.length > 3 && argDetails.name.slice(-3) === '...') {
      argDetails.variadic = true;
      argDetails.name = argDetails.name.slice(0, -3);
    }
    if (argDetails.name) {
      self._args.push(argDetails);
    }
  });
  return this;
};

/**
 * Register callback `fn` for the command.
 *
 * Examples:
 *
 *      program
 *        .command('help')
 *        .description('display verbose help')
 *        .action(function() {
 *           // output help here
 *        });
 *
 * @param {Function} fn
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.action = function(fn) {
  var self = this;
  var listener = function(args, unknown) {
    // Parse any so-far unknown options
    args = args || [];
    unknown = unknown || [];

    var parsed = self.parseOptions(unknown);

    // Output help if necessary
    outputHelpIfNecessary(self, parsed.unknown);

    // If there are still any unknown options, then we simply
    // die, unless someone asked for help, in which case we give it
    // to them, and then we die.
    if (parsed.unknown.length > 0) {
      self.unknownOption(parsed.unknown[0]);
    }

    // Leftover arguments need to be pushed back. Fixes issue #56
    if (parsed.args.length) args = parsed.args.concat(args);

    self._args.forEach(function(arg, i) {
      if (arg.required && null == args[i]) {
        self.missingArgument(arg.name);
      } else if (arg.variadic) {
        if (i !== self._args.length - 1) {
          self.variadicArgNotLast(arg.name);
        }

        args[i] = args.splice(i);
      }
    });

    // Always append ourselves to the end of the arguments,
    // to make sure we match the number of arguments the user
    // expects
    if (self._args.length) {
      args[self._args.length] = self;
    } else {
      args.push(self);
    }

    fn.apply(self, args);
  };
  var parent = this.parent || this;
  var name = parent === this ? '*' : this._name;
  parent.on(name, listener);
  if (this._alias) parent.on(this._alias, listener);
  return this;
};

/**
 * Define option with `flags`, `description` and optional
 * coercion `fn`.
 *
 * The `flags` string should contain both the short and long flags,
 * separated by comma, a pipe or space. The following are all valid
 * all will output this way when `--help` is used.
 *
 *    "-p, --pepper"
 *    "-p|--pepper"
 *    "-p --pepper"
 *
 * Examples:
 *
 *     // simple boolean defaulting to false
 *     program.option('-p, --pepper', 'add pepper');
 *
 *     --pepper
 *     program.pepper
 *     // => Boolean
 *
 *     // simple boolean defaulting to true
 *     program.option('-C, --no-cheese', 'remove cheese');
 *
 *     program.cheese
 *     // => true
 *
 *     --no-cheese
 *     program.cheese
 *     // => false
 *
 *     // required argument
 *     program.option('-C, --chdir <path>', 'change the working directory');
 *
 *     --chdir /tmp
 *     program.chdir
 *     // => "/tmp"
 *
 *     // optional argument
 *     program.option('-c, --cheese [type]', 'add cheese [marble]');
 *
 * @param {String} flags
 * @param {String} description
 * @param {Function|Mixed} fn or default
 * @param {Mixed} defaultValue
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.option = function(flags, description, fn, defaultValue) {
  var self = this
    , option = new Option(flags, description)
    , oname = option.name()
    , name = camelcase(oname);

  // default as 3rd arg
  if (typeof fn != 'function') {
    if (fn instanceof RegExp) {
      var regex = fn;
      fn = function(val, def) {
        var m = regex.exec(val);
        return m ? m[0] : def;
      }
    }
    else {
      defaultValue = fn;
      fn = null;
    }
  }

  // preassign default value only for --no-*, [optional], or <required>
  if (false == option.bool || option.optional || option.required) {
    // when --no-* we make sure default is true
    if (false == option.bool) defaultValue = true;
    // preassign only if we have a default
    if (undefined !== defaultValue) self[name] = defaultValue;
  }

  // register the option
  this.options.push(option);

  // when it's passed assign the value
  // and conditionally invoke the callback
  this.on(oname, function(val) {
    // coercion
    if (null !== val && fn) val = fn(val, undefined === self[name]
      ? defaultValue
      : self[name]);

    // unassigned or bool
    if ('boolean' == typeof self[name] || 'undefined' == typeof self[name]) {
      // if no value, bool true, and we have a default, then use it!
      if (null == val) {
        self[name] = option.bool
          ? defaultValue || true
          : false;
      } else {
        self[name] = val;
      }
    } else if (null !== val) {
      // reassign
      self[name] = val;
    }
  });

  return this;
};

/**
 * Allow unknown options on the command line.
 *
 * @param {Boolean} arg if `true` or omitted, no error will be thrown
 * for unknown options.
 * @api public
 */
Command.prototype.allowUnknownOption = function(arg) {
    this._allowUnknownOption = arguments.length === 0 || arg;
    return this;
};

/**
 * Parse `argv`, settings options and invoking commands when defined.
 *
 * @param {Array} argv
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.parse = function(argv) {
  // implicit help
  if (this.executables) this.addImplicitHelpCommand();

  // store raw args
  this.rawArgs = argv;

  // guess name
  this._name = this._name || basename(argv[1], '.js');

  // github-style sub-commands with no sub-command
  if (this.executables && argv.length < 3) {
    // this user needs help
    argv.push('--help');
  }

  // process argv
  var parsed = this.parseOptions(this.normalize(argv.slice(2)));
  var args = this.args = parsed.args;

  var result = this.parseArgs(this.args, parsed.unknown);

  // executable sub-commands
  var name = result.args[0];
  if (this._execs[name] && typeof this._execs[name] != "function") {
    return this.executeSubCommand(argv, args, parsed.unknown);
  }

  return result;
};

/**
 * Execute a sub-command executable.
 *
 * @param {Array} argv
 * @param {Array} args
 * @param {Array} unknown
 * @api private
 */

Command.prototype.executeSubCommand = function(argv, args, unknown) {
  args = args.concat(unknown);

  if (!args.length) this.help();
  if ('help' == args[0] && 1 == args.length) this.help();

  // <cmd> --help
  if ('help' == args[0]) {
    args[0] = args[1];
    args[1] = '--help';
  }

  // executable
  var f = argv[1];
  // name of the subcommand, link `pm-install`
  var bin = basename(f, '.js') + '-' + args[0];


  // In case of globally installed, get the base dir where executable
  //  subcommand file should be located at
  var baseDir
    , link = readlink(f);

  // when symbolink is relative path
  if (link !== f && link.charAt(0) !== '/') {
    link = path.join(dirname(f), link)
  }
  baseDir = dirname(link);

  // prefer local `./<bin>` to bin in the $PATH
  var localBin = path.join(baseDir, bin);

  // whether bin file is a js script with explicit `.js` extension
  var isExplicitJS = false;
  if (exists(localBin + '.js')) {
    bin = localBin + '.js';
    isExplicitJS = true;
  } else if (exists(localBin)) {
    bin = localBin;
  }

  args = args.slice(1);

  var proc;
  if (process.platform !== 'win32') {
    if (isExplicitJS) {
      args.unshift(localBin);
      // add executable arguments to spawn
      args = (process.execArgv || []).concat(args);

      proc = spawn('node', args, { stdio: 'inherit', customFds: [0, 1, 2] });
    } else {
      proc = spawn(bin, args, { stdio: 'inherit', customFds: [0, 1, 2] });
    }
  } else {
    args.unshift(localBin);
    proc = spawn(process.execPath, args, { stdio: 'inherit'});
  }

  proc.on('close', process.exit.bind(process));
  proc.on('error', function(err) {
    if (err.code == "ENOENT") {
      console.error('\n  %s(1) does not exist, try --help\n', bin);
    } else if (err.code == "EACCES") {
      console.error('\n  %s(1) not executable. try chmod or run with root\n', bin);
    }
    process.exit(1);
  });

  this.runningCommand = proc;
};

/**
 * Normalize `args`, splitting joined short flags. For example
 * the arg "-abc" is equivalent to "-a -b -c".
 * This also normalizes equal sign and splits "--abc=def" into "--abc def".
 *
 * @param {Array} args
 * @return {Array}
 * @api private
 */

Command.prototype.normalize = function(args) {
  var ret = []
    , arg
    , lastOpt
    , index;

  for (var i = 0, len = args.length; i < len; ++i) {
    arg = args[i];
    if (i > 0) {
      lastOpt = this.optionFor(args[i-1]);
    }

    if (arg === '--') {
      // Honor option terminator
      ret = ret.concat(args.slice(i));
      break;
    } else if (lastOpt && lastOpt.required) {
      ret.push(arg);
    } else if (arg.length > 1 && '-' == arg[0] && '-' != arg[1]) {
      arg.slice(1).split('').forEach(function(c) {
        ret.push('-' + c);
      });
    } else if (/^--/.test(arg) && ~(index = arg.indexOf('='))) {
      ret.push(arg.slice(0, index), arg.slice(index + 1));
    } else {
      ret.push(arg);
    }
  }

  return ret;
};

/**
 * Parse command `args`.
 *
 * When listener(s) are available those
 * callbacks are invoked, otherwise the "*"
 * event is emitted and those actions are invoked.
 *
 * @param {Array} args
 * @return {Command} for chaining
 * @api private
 */

Command.prototype.parseArgs = function(args, unknown) {
  var name;

  if (args.length) {
    name = args[0];
    if (this.listeners(name).length) {
      this.emit(args.shift(), args, unknown);
    } else {
      this.emit('*', args);
    }
  } else {
    outputHelpIfNecessary(this, unknown);

    // If there were no args and we have unknown options,
    // then they are extraneous and we need to error.
    if (unknown.length > 0) {
      this.unknownOption(unknown[0]);
    }
  }

  return this;
};

/**
 * Return an option matching `arg` if any.
 *
 * @param {String} arg
 * @return {Option}
 * @api private
 */

Command.prototype.optionFor = function(arg) {
  for (var i = 0, len = this.options.length; i < len; ++i) {
    if (this.options[i].is(arg)) {
      return this.options[i];
    }
  }
};

/**
 * Parse options from `argv` returning `argv`
 * void of these options.
 *
 * @param {Array} argv
 * @return {Array}
 * @api public
 */

Command.prototype.parseOptions = function(argv) {
  var args = []
    , len = argv.length
    , literal
    , option
    , arg;

  var unknownOptions = [];

  // parse options
  for (var i = 0; i < len; ++i) {
    arg = argv[i];

    // literal args after --
    if ('--' == arg) {
      literal = true;
      continue;
    }

    if (literal) {
      args.push(arg);
      continue;
    }

    // find matching Option
    option = this.optionFor(arg);

    // option is defined
    if (option) {
      // requires arg
      if (option.required) {
        arg = argv[++i];
        if (null == arg) return this.optionMissingArgument(option);
        this.emit(option.name(), arg);
      // optional arg
      } else if (option.optional) {
        arg = argv[i+1];
        if (null == arg || ('-' == arg[0] && '-' != arg)) {
          arg = null;
        } else {
          ++i;
        }
        this.emit(option.name(), arg);
      // bool
      } else {
        this.emit(option.name());
      }
      continue;
    }

    // looks like an option
    if (arg.length > 1 && '-' == arg[0]) {
      unknownOptions.push(arg);

      // If the next argument looks like it might be
      // an argument for this option, we pass it on.
      // If it isn't, then it'll simply be ignored
      if (argv[i+1] && '-' != argv[i+1][0]) {
        unknownOptions.push(argv[++i]);
      }
      continue;
    }

    // arg
    args.push(arg);
  }

  return { args: args, unknown: unknownOptions };
};

/**
 * Return an object containing options as key-value pairs
 *
 * @return {Object}
 * @api public
 */
Command.prototype.opts = function() {
  var result = {}
    , len = this.options.length;

  for (var i = 0 ; i < len; i++) {
    var key = camelcase(this.options[i].name());
    result[key] = key === 'version' ? this._version : this[key];
  }
  return result;
};

/**
 * Argument `name` is missing.
 *
 * @param {String} name
 * @api private
 */

Command.prototype.missingArgument = function(name) {
  console.error();
  console.error("  error: missing required argument `%s'", name);
  console.error();
  process.exit(1);
};

/**
 * `Option` is missing an argument, but received `flag` or nothing.
 *
 * @param {String} option
 * @param {String} flag
 * @api private
 */

Command.prototype.optionMissingArgument = function(option, flag) {
  console.error();
  if (flag) {
    console.error("  error: option `%s' argument missing, got `%s'", option.flags, flag);
  } else {
    console.error("  error: option `%s' argument missing", option.flags);
  }
  console.error();
  process.exit(1);
};

/**
 * Unknown option `flag`.
 *
 * @param {String} flag
 * @api private
 */

Command.prototype.unknownOption = function(flag) {
  if (this._allowUnknownOption) return;
  console.error();
  console.error("  error: unknown option `%s'", flag);
  console.error();
  process.exit(1);
};

/**
 * Variadic argument with `name` is not the last argument as required.
 *
 * @param {String} name
 * @api private
 */

Command.prototype.variadicArgNotLast = function(name) {
  console.error();
  console.error("  error: variadic arguments must be last `%s'", name);
  console.error();
  process.exit(1);
};

/**
 * Set the program version to `str`.
 *
 * This method auto-registers the "-V, --version" flag
 * which will print the version number when passed.
 *
 * @param {String} str
 * @param {String} flags
 * @return {Command} for chaining
 * @api public
 */

Command.prototype.version = function(str, flags) {
  if (0 == arguments.length) return this._version;
  this._version = str;
  flags = flags || '-V, --version';
  this.option(flags, 'output the version number');
  this.on('version', function() {
    process.stdout.write(str + '\n');
    process.exit(0);
  });
  return this;
};

/**
 * Set the description to `str`.
 *
 * @param {String} str
 * @return {String|Command}
 * @api public
 */

Command.prototype.description = function(str) {
  if (0 == arguments.length) return this._description;
  this._description = str;
  return this;
};

/**
 * Set an alias for the command
 *
 * @param {String} alias
 * @return {String|Command}
 * @api public
 */

Command.prototype.alias = function(alias) {
  if (0 == arguments.length) return this._alias;
  this._alias = alias;
  return this;
};

/**
 * Set / get the command usage `str`.
 *
 * @param {String} str
 * @return {String|Command}
 * @api public
 */

Command.prototype.usage = function(str) {
  var args = this._args.map(function(arg) {
    return humanReadableArgName(arg);
  });

  var usage = '[options]'
    + (this.commands.length ? ' [command]' : '')
    + (this._args.length ? ' ' + args.join(' ') : '');

  if (0 == arguments.length) return this._usage || usage;
  this._usage = str;

  return this;
};

/**
 * Get the name of the command
 *
 * @param {String} name
 * @return {String|Command}
 * @api public
 */

Command.prototype.name = function() {
  return this._name;
};

/**
 * Return the largest option length.
 *
 * @return {Number}
 * @api private
 */

Command.prototype.largestOptionLength = function() {
  return this.options.reduce(function(max, option) {
    return Math.max(max, option.flags.length);
  }, 0);
};

/**
 * Return help for options.
 *
 * @return {String}
 * @api private
 */

Command.prototype.optionHelp = function() {
  var width = this.largestOptionLength();

  // Prepend the help information
  return [pad('-h, --help', width) + '  ' + 'output usage information']
    .concat(this.options.map(function(option) {
      return pad(option.flags, width) + '  ' + option.description;
      }))
    .join('\n');
};

/**
 * Return command help documentation.
 *
 * @return {String}
 * @api private
 */

Command.prototype.commandHelp = function() {
  if (!this.commands.length) return '';

  var commands = this.commands.filter(function(cmd) {
    return !cmd._noHelp;
  }).map(function(cmd) {
    var args = cmd._args.map(function(arg) {
      return humanReadableArgName(arg);
    }).join(' ');

    return [
      cmd._name
        + (cmd._alias
          ? '|' + cmd._alias
          : '')
        + (cmd.options.length
          ? ' [options]'
          : '')
        + ' ' + args
    , cmd.description()
    ];
  });

  var width = commands.reduce(function(max, command) {
    return Math.max(max, command[0].length);
  }, 0);

  return [
      ''
    , '  Commands:'
    , ''
    , commands.map(function(cmd) {
      return pad(cmd[0], width) + '  ' + cmd[1];
    }).join('\n').replace(/^/gm, '    ')
    , ''
  ].join('\n');
};

/**
 * Return program help documentation.
 *
 * @return {String}
 * @api private
 */

Command.prototype.helpInformation = function() {
  var desc = [];
  if (this._description) {
    desc = [
      '  ' + this._description
      , ''
    ];
  }

  var cmdName = this._name;
  if (this._alias) {
    cmdName = cmdName + '|' + this._alias;
  }
  var usage = [
    ''
    ,'  Usage: ' + cmdName + ' ' + this.usage()
    , ''
  ];

  var cmds = [];
  var commandHelp = this.commandHelp();
  if (commandHelp) cmds = [commandHelp];

  var options = [
    '  Options:'
    , ''
    , '' + this.optionHelp().replace(/^/gm, '    ')
    , ''
    , ''
  ];

  return usage
    .concat(cmds)
    .concat(desc)
    .concat(options)
    .join('\n');
};

/**
 * Output help information for this command
 *
 * @api public
 */

Command.prototype.outputHelp = function() {
  process.stdout.write(this.helpInformation());
  this.emit('--help');
};

/**
 * Output help information and exit.
 *
 * @api public
 */

Command.prototype.help = function() {
  this.outputHelp();
  process.exit();
};

/**
 * Camel-case the given `flag`
 *
 * @param {String} flag
 * @return {String}
 * @api private
 */

function camelcase(flag) {
  return flag.split('-').reduce(function(str, word) {
    return str + word[0].toUpperCase() + word.slice(1);
  });
}

/**
 * Pad `str` to `width`.
 *
 * @param {String} str
 * @param {Number} width
 * @return {String}
 * @api private
 */

function pad(str, width) {
  var len = Math.max(0, width - str.length);
  return str + Array(len + 1).join(' ');
}

/**
 * Output help information if necessary
 *
 * @param {Command} command to output help for
 * @param {Array} array of options to search for -h or --help
 * @api private
 */

function outputHelpIfNecessary(cmd, options) {
  options = options || [];
  for (var i = 0; i < options.length; i++) {
    if (options[i] == '--help' || options[i] == '-h') {
      cmd.outputHelp();
      process.exit(0);
    }
  }
}

/**
 * Takes an argument an returns its human readable equivalent for help usage.
 *
 * @param {Object} arg
 * @return {String}
 * @api private
 */

function humanReadableArgName(arg) {
  var nameOutput = arg.name + (arg.variadic === true ? '...' : '');

  return arg.required
    ? '<' + nameOutput + '>'
    : '[' + nameOutput + ']'
}

// for versions before node v0.8 when there weren't `fs.existsSync`
function exists(file) {
  try {
    if (fs.statSync(file).isFile()) {
      return true;
    }
  } catch (e) {
    return false;
  }
}


}).call(this,require('_process'),typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})

},{"_process":5,"child_process":2,"events":3,"fs":2,"graceful-readlink":6,"path":4,"system":undefined}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],4:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require('_process'))

},{"_process":5}],5:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            currentQueue[queueIndex].run();
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (!draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],6:[function(require,module,exports){
var fs = require('fs')
  , lstat = fs.lstatSync;

exports.readlinkSync = function (p) {
  if (lstat(p).isSymbolicLink()) {
    return fs.readlinkSync(p);
  } else {
    return p;
  }
};



},{"fs":2}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY29tbWFuZGVyL2luZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwibm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCJub2RlX21vZHVsZXMvY29tbWFuZGVyL25vZGVfbW9kdWxlcy9ncmFjZWZ1bC1yZWFkbGluay9pbmRleC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ3htQ0E7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7O0FDN1NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7OztBQ2hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiKGZ1bmN0aW9uKCl7dmFyIG1vZHVsZT17fTsvLyBERVY6IFRoaXMgaXMgbm90IGluIGEgc2VwYXJhdGUgZmlsZSBzaW5jZSB3ZSBtYXkgaGF2ZSBub2RlIGJhc2VkIGRlcGVuZGVuY2llcyAoZS5nLiBgd2hpY2hgIGF0IHNvbWUgcG9pbnQpXG52YXIgc3lzdGVtID0gcmVxdWlyZSgnc3lzdGVtJyk7XG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluc3RhbGxTaGltcyAoKSB7XG4gIC8vIFRPRE86IHN0ZGluIHVzZXMgdGhlIHNhbWUgQVBJIGFzIGl0cyBzdHJlYW1zIGluIGZzIGJ1dCB0aGlzIGRvZXNuJ3QgbGluZSB1cCB3aXRoIG5vZGVcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FyaXlhL3BoYW50b21qcy93aWtpL0FQSS1SZWZlcmVuY2UtRmlsZVN5c3RlbVxuICAvLyBodHRwczovL2dpdGh1Yi5jb20vYXJpeWEvcGhhbnRvbWpzL2lzc3Vlcy8xMDI3MFxuICAvLyBodHRwOi8vd2lraS5jb21tb25qcy5vcmcvd2lraS9TeXN0ZW1cbiAgLy8gcHJvY2Vzcy5zdGRpbiA9IHN5c3RlbS5zdGRpbjtcblxuICAvLyBodHRwOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19zdGRvdXRcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FyaXlhL3BoYW50b21qcy9ibG9iLzEuOS4yL3NyYy9zeXN0ZW0uY3BwI0wxNzYtTDIwNFxuICBwcm9jZXNzLnN0ZG91dCA9IHN5c3RlbS5zdGRvdXQ7XG4gIHByb2Nlc3Muc3RkZXJyID0gc3lzdGVtLnN0ZGVycjtcblxuICAvLyBodHRwOi8vbm9kZWpzLm9yZy9hcGkvcHJvY2Vzcy5odG1sI3Byb2Nlc3NfcHJvY2Vzc19leGl0X2NvZGVcbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FyaXlhL3BoYW50b21qcy93aWtpL0FQSS1SZWZlcmVuY2UtcGhhbnRvbSNleGl0cmV0dXJudmFsdWUtdm9pZFxuICBwcm9jZXNzLmV4aXQgPSBwaGFudG9tLmV4aXQ7XG5cbiAgLy8gaHR0cHM6Ly9naXRodWIuY29tL2FyaXlhL3BoYW50b21qcy93aWtpL0FQSS1SZWZlcmVuY2Utc3lzdGVtI3dpa2ktc3lzdGVtLWFyZ3NcbiAgLy8gaHR0cDovL25vZGVqcy5vcmcvYXBpL3Byb2Nlc3MuaHRtbCNwcm9jZXNzX3Byb2Nlc3NfYXJndlxuICAvLyBUT0RPOiBXaWxsIHRoaXMgd29yayBvbiBXaW5kb3dzP1xuICBwcm9jZXNzLmFyZ3YgPSBbJ3BoYW50b21qcyddLmNvbmNhdChzeXN0ZW0uYXJncyk7XG5cbiAgLy8gRXhwb3NlIHByb2Nlc3MgYXMgYSBnbG9iYWxcbiAgZ2xvYmFsLnByb2Nlc3MgPSBwcm9jZXNzO1xufTttb2R1bGUuZXhwb3J0cygpO30oKSk7XG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlcjtcbnZhciBzcGF3biA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5zcGF3bjtcbnZhciByZWFkbGluayA9IHJlcXVpcmUoJ2dyYWNlZnVsLXJlYWRsaW5rJykucmVhZGxpbmtTeW5jO1xudmFyIHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG52YXIgZGlybmFtZSA9IHBhdGguZGlybmFtZTtcbnZhciBiYXNlbmFtZSA9IHBhdGguYmFzZW5hbWU7XG52YXIgZnMgPSByZXF1aXJlKCdmcycpO1xuXG4vKipcbiAqIEV4cG9zZSB0aGUgcm9vdCBjb21tYW5kLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IG5ldyBDb21tYW5kKCk7XG5cbi8qKlxuICogRXhwb3NlIGBDb21tYW5kYC5cbiAqL1xuXG5leHBvcnRzLkNvbW1hbmQgPSBDb21tYW5kO1xuXG4vKipcbiAqIEV4cG9zZSBgT3B0aW9uYC5cbiAqL1xuXG5leHBvcnRzLk9wdGlvbiA9IE9wdGlvbjtcblxuLyoqXG4gKiBJbml0aWFsaXplIGEgbmV3IGBPcHRpb25gIHdpdGggdGhlIGdpdmVuIGBmbGFnc2AgYW5kIGBkZXNjcmlwdGlvbmAuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZsYWdzXG4gKiBAcGFyYW0ge1N0cmluZ30gZGVzY3JpcHRpb25cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gT3B0aW9uKGZsYWdzLCBkZXNjcmlwdGlvbikge1xuICB0aGlzLmZsYWdzID0gZmxhZ3M7XG4gIHRoaXMucmVxdWlyZWQgPSB+ZmxhZ3MuaW5kZXhPZignPCcpO1xuICB0aGlzLm9wdGlvbmFsID0gfmZsYWdzLmluZGV4T2YoJ1snKTtcbiAgdGhpcy5ib29sID0gIX5mbGFncy5pbmRleE9mKCctbm8tJyk7XG4gIGZsYWdzID0gZmxhZ3Muc3BsaXQoL1sgLHxdKy8pO1xuICBpZiAoZmxhZ3MubGVuZ3RoID4gMSAmJiAhL15bWzxdLy50ZXN0KGZsYWdzWzFdKSkgdGhpcy5zaG9ydCA9IGZsYWdzLnNoaWZ0KCk7XG4gIHRoaXMubG9uZyA9IGZsYWdzLnNoaWZ0KCk7XG4gIHRoaXMuZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbiB8fCAnJztcbn1cblxuLyoqXG4gKiBSZXR1cm4gb3B0aW9uIG5hbWUuXG4gKlxuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuT3B0aW9uLnByb3RvdHlwZS5uYW1lID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLmxvbmdcbiAgICAucmVwbGFjZSgnLS0nLCAnJylcbiAgICAucmVwbGFjZSgnbm8tJywgJycpO1xufTtcblxuLyoqXG4gKiBDaGVjayBpZiBgYXJnYCBtYXRjaGVzIHRoZSBzaG9ydCBvciBsb25nIGZsYWcuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ1xuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbk9wdGlvbi5wcm90b3R5cGUuaXMgPSBmdW5jdGlvbihhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSB0aGlzLnNob3J0IHx8IGFyZyA9PSB0aGlzLmxvbmc7XG59O1xuXG4vKipcbiAqIEluaXRpYWxpemUgYSBuZXcgYENvbW1hbmRgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIENvbW1hbmQobmFtZSkge1xuICB0aGlzLmNvbW1hbmRzID0gW107XG4gIHRoaXMub3B0aW9ucyA9IFtdO1xuICB0aGlzLl9leGVjcyA9IFtdO1xuICB0aGlzLl9hbGxvd1Vua25vd25PcHRpb24gPSBmYWxzZTtcbiAgdGhpcy5fYXJncyA9IFtdO1xuICB0aGlzLl9uYW1lID0gbmFtZTtcbn1cblxuLyoqXG4gKiBJbmhlcml0IGZyb20gYEV2ZW50RW1pdHRlci5wcm90b3R5cGVgLlxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLl9fcHJvdG9fXyA9IEV2ZW50RW1pdHRlci5wcm90b3R5cGU7XG5cbi8qKlxuICogQWRkIGNvbW1hbmQgYG5hbWVgLlxuICpcbiAqIFRoZSBgLmFjdGlvbigpYCBjYWxsYmFjayBpcyBpbnZva2VkIHdoZW4gdGhlXG4gKiBjb21tYW5kIGBuYW1lYCBpcyBzcGVjaWZpZWQgdmlhIF9fQVJHVl9fLFxuICogYW5kIHRoZSByZW1haW5pbmcgYXJndW1lbnRzIGFyZSBhcHBsaWVkIHRvIHRoZVxuICogZnVuY3Rpb24gZm9yIGFjY2Vzcy5cbiAqXG4gKiBXaGVuIHRoZSBgbmFtZWAgaXMgXCIqXCIgYW4gdW4tbWF0Y2hlZCBjb21tYW5kXG4gKiB3aWxsIGJlIHBhc3NlZCBhcyB0aGUgZmlyc3QgYXJnLCBmb2xsb3dlZCBieVxuICogdGhlIHJlc3Qgb2YgX19BUkdWX18gcmVtYWluaW5nLlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAgcHJvZ3JhbVxuICogICAgICAgIC52ZXJzaW9uKCcwLjAuMScpXG4gKiAgICAgICAgLm9wdGlvbignLUMsIC0tY2hkaXIgPHBhdGg+JywgJ2NoYW5nZSB0aGUgd29ya2luZyBkaXJlY3RvcnknKVxuICogICAgICAgIC5vcHRpb24oJy1jLCAtLWNvbmZpZyA8cGF0aD4nLCAnc2V0IGNvbmZpZyBwYXRoLiBkZWZhdWx0cyB0byAuL2RlcGxveS5jb25mJylcbiAqICAgICAgICAub3B0aW9uKCctVCwgLS1uby10ZXN0cycsICdpZ25vcmUgdGVzdCBob29rJylcbiAqXG4gKiAgICAgIHByb2dyYW1cbiAqICAgICAgICAuY29tbWFuZCgnc2V0dXAnKVxuICogICAgICAgIC5kZXNjcmlwdGlvbigncnVuIHJlbW90ZSBzZXR1cCBjb21tYW5kcycpXG4gKiAgICAgICAgLmFjdGlvbihmdW5jdGlvbigpIHtcbiAqICAgICAgICAgIGNvbnNvbGUubG9nKCdzZXR1cCcpO1xuICogICAgICAgIH0pO1xuICpcbiAqICAgICAgcHJvZ3JhbVxuICogICAgICAgIC5jb21tYW5kKCdleGVjIDxjbWQ+JylcbiAqICAgICAgICAuZGVzY3JpcHRpb24oJ3J1biB0aGUgZ2l2ZW4gcmVtb3RlIGNvbW1hbmQnKVxuICogICAgICAgIC5hY3Rpb24oZnVuY3Rpb24oY21kKSB7XG4gKiAgICAgICAgICBjb25zb2xlLmxvZygnZXhlYyBcIiVzXCInLCBjbWQpO1xuICogICAgICAgIH0pO1xuICpcbiAqICAgICAgcHJvZ3JhbVxuICogICAgICAgIC5jb21tYW5kKCd0ZWFyZG93biA8ZGlyPiBbb3RoZXJEaXJzLi4uXScpXG4gKiAgICAgICAgLmRlc2NyaXB0aW9uKCdydW4gdGVhcmRvd24gY29tbWFuZHMnKVxuICogICAgICAgIC5hY3Rpb24oZnVuY3Rpb24oZGlyLCBvdGhlckRpcnMpIHtcbiAqICAgICAgICAgIGNvbnNvbGUubG9nKCdkaXIgXCIlc1wiJywgZGlyKTtcbiAqICAgICAgICAgIGlmIChvdGhlckRpcnMpIHtcbiAqICAgICAgICAgICAgb3RoZXJEaXJzLmZvckVhY2goZnVuY3Rpb24gKG9EaXIpIHtcbiAqICAgICAgICAgICAgICBjb25zb2xlLmxvZygnZGlyIFwiJXNcIicsIG9EaXIpO1xuICogICAgICAgICAgICB9KTtcbiAqICAgICAgICAgIH1cbiAqICAgICAgICB9KTtcbiAqXG4gKiAgICAgIHByb2dyYW1cbiAqICAgICAgICAuY29tbWFuZCgnKicpXG4gKiAgICAgICAgLmRlc2NyaXB0aW9uKCdkZXBsb3kgdGhlIGdpdmVuIGVudicpXG4gKiAgICAgICAgLmFjdGlvbihmdW5jdGlvbihlbnYpIHtcbiAqICAgICAgICAgIGNvbnNvbGUubG9nKCdkZXBsb3lpbmcgXCIlc1wiJywgZW52KTtcbiAqICAgICAgICB9KTtcbiAqXG4gKiAgICAgIHByb2dyYW0ucGFyc2UocHJvY2Vzcy5hcmd2KTtcbiAgKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBwYXJhbSB7U3RyaW5nfSBbZGVzY10gZm9yIGdpdC1zdHlsZSBzdWItY29tbWFuZHNcbiAqIEByZXR1cm4ge0NvbW1hbmR9IHRoZSBuZXcgY29tbWFuZFxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5jb21tYW5kID0gZnVuY3Rpb24obmFtZSwgZGVzYywgb3B0cykge1xuICBvcHRzID0gb3B0cyB8fCB7fTtcbiAgdmFyIGFyZ3MgPSBuYW1lLnNwbGl0KC8gKy8pO1xuICB2YXIgY21kID0gbmV3IENvbW1hbmQoYXJncy5zaGlmdCgpKTtcblxuICBpZiAoZGVzYykge1xuICAgIGNtZC5kZXNjcmlwdGlvbihkZXNjKTtcbiAgICB0aGlzLmV4ZWN1dGFibGVzID0gdHJ1ZTtcbiAgICB0aGlzLl9leGVjc1tjbWQuX25hbWVdID0gdHJ1ZTtcbiAgfVxuXG4gIGNtZC5fbm9IZWxwID0gISFvcHRzLm5vSGVscDtcbiAgdGhpcy5jb21tYW5kcy5wdXNoKGNtZCk7XG4gIGNtZC5wYXJzZUV4cGVjdGVkQXJncyhhcmdzKTtcbiAgY21kLnBhcmVudCA9IHRoaXM7XG5cbiAgaWYgKGRlc2MpIHJldHVybiB0aGlzO1xuICByZXR1cm4gY21kO1xufTtcblxuLyoqXG4gKiBEZWZpbmUgYXJndW1lbnQgc3ludGF4IGZvciB0aGUgdG9wLWxldmVsIGNvbW1hbmQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5hcmd1bWVudHMgPSBmdW5jdGlvbiAoZGVzYykge1xuICByZXR1cm4gdGhpcy5wYXJzZUV4cGVjdGVkQXJncyhkZXNjLnNwbGl0KC8gKy8pKTtcbn1cblxuLyoqXG4gKiBBZGQgYW4gaW1wbGljaXQgYGhlbHAgW2NtZF1gIHN1YmNvbW1hbmRcbiAqIHdoaWNoIGludm9rZXMgYC0taGVscGAgZm9yIHRoZSBnaXZlbiBjb21tYW5kLlxuICpcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLmFkZEltcGxpY2l0SGVscENvbW1hbmQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5jb21tYW5kKCdoZWxwIFtjbWRdJywgJ2Rpc3BsYXkgaGVscCBmb3IgW2NtZF0nKTtcbn07XG5cbi8qKlxuICogUGFyc2UgZXhwZWN0ZWQgYGFyZ3NgLlxuICpcbiAqIEZvciBleGFtcGxlIGBbXCJbdHlwZV1cIl1gIGJlY29tZXMgYFt7IHJlcXVpcmVkOiBmYWxzZSwgbmFtZTogJ3R5cGUnIH1dYC5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhcmdzXG4gKiBAcmV0dXJuIHtDb21tYW5kfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUucGFyc2VFeHBlY3RlZEFyZ3MgPSBmdW5jdGlvbihhcmdzKSB7XG4gIGlmICghYXJncy5sZW5ndGgpIHJldHVybjtcbiAgdmFyIHNlbGYgPSB0aGlzO1xuICBhcmdzLmZvckVhY2goZnVuY3Rpb24oYXJnKSB7XG4gICAgdmFyIGFyZ0RldGFpbHMgPSB7XG4gICAgICByZXF1aXJlZDogZmFsc2UsXG4gICAgICBuYW1lOiAnJyxcbiAgICAgIHZhcmlhZGljOiBmYWxzZVxuICAgIH07XG5cbiAgICBzd2l0Y2ggKGFyZ1swXSkge1xuICAgICAgY2FzZSAnPCc6XG4gICAgICAgIGFyZ0RldGFpbHMucmVxdWlyZWQgPSB0cnVlO1xuICAgICAgICBhcmdEZXRhaWxzLm5hbWUgPSBhcmcuc2xpY2UoMSwgLTEpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1snOlxuICAgICAgICBhcmdEZXRhaWxzLm5hbWUgPSBhcmcuc2xpY2UoMSwgLTEpO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoYXJnRGV0YWlscy5uYW1lLmxlbmd0aCA+IDMgJiYgYXJnRGV0YWlscy5uYW1lLnNsaWNlKC0zKSA9PT0gJy4uLicpIHtcbiAgICAgIGFyZ0RldGFpbHMudmFyaWFkaWMgPSB0cnVlO1xuICAgICAgYXJnRGV0YWlscy5uYW1lID0gYXJnRGV0YWlscy5uYW1lLnNsaWNlKDAsIC0zKTtcbiAgICB9XG4gICAgaWYgKGFyZ0RldGFpbHMubmFtZSkge1xuICAgICAgc2VsZi5fYXJncy5wdXNoKGFyZ0RldGFpbHMpO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBSZWdpc3RlciBjYWxsYmFjayBgZm5gIGZvciB0aGUgY29tbWFuZC5cbiAqXG4gKiBFeGFtcGxlczpcbiAqXG4gKiAgICAgIHByb2dyYW1cbiAqICAgICAgICAuY29tbWFuZCgnaGVscCcpXG4gKiAgICAgICAgLmRlc2NyaXB0aW9uKCdkaXNwbGF5IHZlcmJvc2UgaGVscCcpXG4gKiAgICAgICAgLmFjdGlvbihmdW5jdGlvbigpIHtcbiAqICAgICAgICAgICAvLyBvdXRwdXQgaGVscCBoZXJlXG4gKiAgICAgICAgfSk7XG4gKlxuICogQHBhcmFtIHtGdW5jdGlvbn0gZm5cbiAqIEByZXR1cm4ge0NvbW1hbmR9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5hY3Rpb24gPSBmdW5jdGlvbihmbikge1xuICB2YXIgc2VsZiA9IHRoaXM7XG4gIHZhciBsaXN0ZW5lciA9IGZ1bmN0aW9uKGFyZ3MsIHVua25vd24pIHtcbiAgICAvLyBQYXJzZSBhbnkgc28tZmFyIHVua25vd24gb3B0aW9uc1xuICAgIGFyZ3MgPSBhcmdzIHx8IFtdO1xuICAgIHVua25vd24gPSB1bmtub3duIHx8IFtdO1xuXG4gICAgdmFyIHBhcnNlZCA9IHNlbGYucGFyc2VPcHRpb25zKHVua25vd24pO1xuXG4gICAgLy8gT3V0cHV0IGhlbHAgaWYgbmVjZXNzYXJ5XG4gICAgb3V0cHV0SGVscElmTmVjZXNzYXJ5KHNlbGYsIHBhcnNlZC51bmtub3duKTtcblxuICAgIC8vIElmIHRoZXJlIGFyZSBzdGlsbCBhbnkgdW5rbm93biBvcHRpb25zLCB0aGVuIHdlIHNpbXBseVxuICAgIC8vIGRpZSwgdW5sZXNzIHNvbWVvbmUgYXNrZWQgZm9yIGhlbHAsIGluIHdoaWNoIGNhc2Ugd2UgZ2l2ZSBpdFxuICAgIC8vIHRvIHRoZW0sIGFuZCB0aGVuIHdlIGRpZS5cbiAgICBpZiAocGFyc2VkLnVua25vd24ubGVuZ3RoID4gMCkge1xuICAgICAgc2VsZi51bmtub3duT3B0aW9uKHBhcnNlZC51bmtub3duWzBdKTtcbiAgICB9XG5cbiAgICAvLyBMZWZ0b3ZlciBhcmd1bWVudHMgbmVlZCB0byBiZSBwdXNoZWQgYmFjay4gRml4ZXMgaXNzdWUgIzU2XG4gICAgaWYgKHBhcnNlZC5hcmdzLmxlbmd0aCkgYXJncyA9IHBhcnNlZC5hcmdzLmNvbmNhdChhcmdzKTtcblxuICAgIHNlbGYuX2FyZ3MuZm9yRWFjaChmdW5jdGlvbihhcmcsIGkpIHtcbiAgICAgIGlmIChhcmcucmVxdWlyZWQgJiYgbnVsbCA9PSBhcmdzW2ldKSB7XG4gICAgICAgIHNlbGYubWlzc2luZ0FyZ3VtZW50KGFyZy5uYW1lKTtcbiAgICAgIH0gZWxzZSBpZiAoYXJnLnZhcmlhZGljKSB7XG4gICAgICAgIGlmIChpICE9PSBzZWxmLl9hcmdzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgICBzZWxmLnZhcmlhZGljQXJnTm90TGFzdChhcmcubmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBhcmdzW2ldID0gYXJncy5zcGxpY2UoaSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBBbHdheXMgYXBwZW5kIG91cnNlbHZlcyB0byB0aGUgZW5kIG9mIHRoZSBhcmd1bWVudHMsXG4gICAgLy8gdG8gbWFrZSBzdXJlIHdlIG1hdGNoIHRoZSBudW1iZXIgb2YgYXJndW1lbnRzIHRoZSB1c2VyXG4gICAgLy8gZXhwZWN0c1xuICAgIGlmIChzZWxmLl9hcmdzLmxlbmd0aCkge1xuICAgICAgYXJnc1tzZWxmLl9hcmdzLmxlbmd0aF0gPSBzZWxmO1xuICAgIH0gZWxzZSB7XG4gICAgICBhcmdzLnB1c2goc2VsZik7XG4gICAgfVxuXG4gICAgZm4uYXBwbHkoc2VsZiwgYXJncyk7XG4gIH07XG4gIHZhciBwYXJlbnQgPSB0aGlzLnBhcmVudCB8fCB0aGlzO1xuICB2YXIgbmFtZSA9IHBhcmVudCA9PT0gdGhpcyA/ICcqJyA6IHRoaXMuX25hbWU7XG4gIHBhcmVudC5vbihuYW1lLCBsaXN0ZW5lcik7XG4gIGlmICh0aGlzLl9hbGlhcykgcGFyZW50Lm9uKHRoaXMuX2FsaWFzLCBsaXN0ZW5lcik7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBEZWZpbmUgb3B0aW9uIHdpdGggYGZsYWdzYCwgYGRlc2NyaXB0aW9uYCBhbmQgb3B0aW9uYWxcbiAqIGNvZXJjaW9uIGBmbmAuXG4gKlxuICogVGhlIGBmbGFnc2Agc3RyaW5nIHNob3VsZCBjb250YWluIGJvdGggdGhlIHNob3J0IGFuZCBsb25nIGZsYWdzLFxuICogc2VwYXJhdGVkIGJ5IGNvbW1hLCBhIHBpcGUgb3Igc3BhY2UuIFRoZSBmb2xsb3dpbmcgYXJlIGFsbCB2YWxpZFxuICogYWxsIHdpbGwgb3V0cHV0IHRoaXMgd2F5IHdoZW4gYC0taGVscGAgaXMgdXNlZC5cbiAqXG4gKiAgICBcIi1wLCAtLXBlcHBlclwiXG4gKiAgICBcIi1wfC0tcGVwcGVyXCJcbiAqICAgIFwiLXAgLS1wZXBwZXJcIlxuICpcbiAqIEV4YW1wbGVzOlxuICpcbiAqICAgICAvLyBzaW1wbGUgYm9vbGVhbiBkZWZhdWx0aW5nIHRvIGZhbHNlXG4gKiAgICAgcHJvZ3JhbS5vcHRpb24oJy1wLCAtLXBlcHBlcicsICdhZGQgcGVwcGVyJyk7XG4gKlxuICogICAgIC0tcGVwcGVyXG4gKiAgICAgcHJvZ3JhbS5wZXBwZXJcbiAqICAgICAvLyA9PiBCb29sZWFuXG4gKlxuICogICAgIC8vIHNpbXBsZSBib29sZWFuIGRlZmF1bHRpbmcgdG8gdHJ1ZVxuICogICAgIHByb2dyYW0ub3B0aW9uKCctQywgLS1uby1jaGVlc2UnLCAncmVtb3ZlIGNoZWVzZScpO1xuICpcbiAqICAgICBwcm9ncmFtLmNoZWVzZVxuICogICAgIC8vID0+IHRydWVcbiAqXG4gKiAgICAgLS1uby1jaGVlc2VcbiAqICAgICBwcm9ncmFtLmNoZWVzZVxuICogICAgIC8vID0+IGZhbHNlXG4gKlxuICogICAgIC8vIHJlcXVpcmVkIGFyZ3VtZW50XG4gKiAgICAgcHJvZ3JhbS5vcHRpb24oJy1DLCAtLWNoZGlyIDxwYXRoPicsICdjaGFuZ2UgdGhlIHdvcmtpbmcgZGlyZWN0b3J5Jyk7XG4gKlxuICogICAgIC0tY2hkaXIgL3RtcFxuICogICAgIHByb2dyYW0uY2hkaXJcbiAqICAgICAvLyA9PiBcIi90bXBcIlxuICpcbiAqICAgICAvLyBvcHRpb25hbCBhcmd1bWVudFxuICogICAgIHByb2dyYW0ub3B0aW9uKCctYywgLS1jaGVlc2UgW3R5cGVdJywgJ2FkZCBjaGVlc2UgW21hcmJsZV0nKTtcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmxhZ3NcbiAqIEBwYXJhbSB7U3RyaW5nfSBkZXNjcmlwdGlvblxuICogQHBhcmFtIHtGdW5jdGlvbnxNaXhlZH0gZm4gb3IgZGVmYXVsdFxuICogQHBhcmFtIHtNaXhlZH0gZGVmYXVsdFZhbHVlXG4gKiBAcmV0dXJuIHtDb21tYW5kfSBmb3IgY2hhaW5pbmdcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUub3B0aW9uID0gZnVuY3Rpb24oZmxhZ3MsIGRlc2NyaXB0aW9uLCBmbiwgZGVmYXVsdFZhbHVlKSB7XG4gIHZhciBzZWxmID0gdGhpc1xuICAgICwgb3B0aW9uID0gbmV3IE9wdGlvbihmbGFncywgZGVzY3JpcHRpb24pXG4gICAgLCBvbmFtZSA9IG9wdGlvbi5uYW1lKClcbiAgICAsIG5hbWUgPSBjYW1lbGNhc2Uob25hbWUpO1xuXG4gIC8vIGRlZmF1bHQgYXMgM3JkIGFyZ1xuICBpZiAodHlwZW9mIGZuICE9ICdmdW5jdGlvbicpIHtcbiAgICBpZiAoZm4gaW5zdGFuY2VvZiBSZWdFeHApIHtcbiAgICAgIHZhciByZWdleCA9IGZuO1xuICAgICAgZm4gPSBmdW5jdGlvbih2YWwsIGRlZikge1xuICAgICAgICB2YXIgbSA9IHJlZ2V4LmV4ZWModmFsKTtcbiAgICAgICAgcmV0dXJuIG0gPyBtWzBdIDogZGVmO1xuICAgICAgfVxuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGRlZmF1bHRWYWx1ZSA9IGZuO1xuICAgICAgZm4gPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIC8vIHByZWFzc2lnbiBkZWZhdWx0IHZhbHVlIG9ubHkgZm9yIC0tbm8tKiwgW29wdGlvbmFsXSwgb3IgPHJlcXVpcmVkPlxuICBpZiAoZmFsc2UgPT0gb3B0aW9uLmJvb2wgfHwgb3B0aW9uLm9wdGlvbmFsIHx8IG9wdGlvbi5yZXF1aXJlZCkge1xuICAgIC8vIHdoZW4gLS1uby0qIHdlIG1ha2Ugc3VyZSBkZWZhdWx0IGlzIHRydWVcbiAgICBpZiAoZmFsc2UgPT0gb3B0aW9uLmJvb2wpIGRlZmF1bHRWYWx1ZSA9IHRydWU7XG4gICAgLy8gcHJlYXNzaWduIG9ubHkgaWYgd2UgaGF2ZSBhIGRlZmF1bHRcbiAgICBpZiAodW5kZWZpbmVkICE9PSBkZWZhdWx0VmFsdWUpIHNlbGZbbmFtZV0gPSBkZWZhdWx0VmFsdWU7XG4gIH1cblxuICAvLyByZWdpc3RlciB0aGUgb3B0aW9uXG4gIHRoaXMub3B0aW9ucy5wdXNoKG9wdGlvbik7XG5cbiAgLy8gd2hlbiBpdCdzIHBhc3NlZCBhc3NpZ24gdGhlIHZhbHVlXG4gIC8vIGFuZCBjb25kaXRpb25hbGx5IGludm9rZSB0aGUgY2FsbGJhY2tcbiAgdGhpcy5vbihvbmFtZSwgZnVuY3Rpb24odmFsKSB7XG4gICAgLy8gY29lcmNpb25cbiAgICBpZiAobnVsbCAhPT0gdmFsICYmIGZuKSB2YWwgPSBmbih2YWwsIHVuZGVmaW5lZCA9PT0gc2VsZltuYW1lXVxuICAgICAgPyBkZWZhdWx0VmFsdWVcbiAgICAgIDogc2VsZltuYW1lXSk7XG5cbiAgICAvLyB1bmFzc2lnbmVkIG9yIGJvb2xcbiAgICBpZiAoJ2Jvb2xlYW4nID09IHR5cGVvZiBzZWxmW25hbWVdIHx8ICd1bmRlZmluZWQnID09IHR5cGVvZiBzZWxmW25hbWVdKSB7XG4gICAgICAvLyBpZiBubyB2YWx1ZSwgYm9vbCB0cnVlLCBhbmQgd2UgaGF2ZSBhIGRlZmF1bHQsIHRoZW4gdXNlIGl0IVxuICAgICAgaWYgKG51bGwgPT0gdmFsKSB7XG4gICAgICAgIHNlbGZbbmFtZV0gPSBvcHRpb24uYm9vbFxuICAgICAgICAgID8gZGVmYXVsdFZhbHVlIHx8IHRydWVcbiAgICAgICAgICA6IGZhbHNlO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgc2VsZltuYW1lXSA9IHZhbDtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKG51bGwgIT09IHZhbCkge1xuICAgICAgLy8gcmVhc3NpZ25cbiAgICAgIHNlbGZbbmFtZV0gPSB2YWw7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWxsb3cgdW5rbm93biBvcHRpb25zIG9uIHRoZSBjb21tYW5kIGxpbmUuXG4gKlxuICogQHBhcmFtIHtCb29sZWFufSBhcmcgaWYgYHRydWVgIG9yIG9taXR0ZWQsIG5vIGVycm9yIHdpbGwgYmUgdGhyb3duXG4gKiBmb3IgdW5rbm93biBvcHRpb25zLlxuICogQGFwaSBwdWJsaWNcbiAqL1xuQ29tbWFuZC5wcm90b3R5cGUuYWxsb3dVbmtub3duT3B0aW9uID0gZnVuY3Rpb24oYXJnKSB7XG4gICAgdGhpcy5fYWxsb3dVbmtub3duT3B0aW9uID0gYXJndW1lbnRzLmxlbmd0aCA9PT0gMCB8fCBhcmc7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFBhcnNlIGBhcmd2YCwgc2V0dGluZ3Mgb3B0aW9ucyBhbmQgaW52b2tpbmcgY29tbWFuZHMgd2hlbiBkZWZpbmVkLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3ZcbiAqIEByZXR1cm4ge0NvbW1hbmR9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5wYXJzZSA9IGZ1bmN0aW9uKGFyZ3YpIHtcbiAgLy8gaW1wbGljaXQgaGVscFxuICBpZiAodGhpcy5leGVjdXRhYmxlcykgdGhpcy5hZGRJbXBsaWNpdEhlbHBDb21tYW5kKCk7XG5cbiAgLy8gc3RvcmUgcmF3IGFyZ3NcbiAgdGhpcy5yYXdBcmdzID0gYXJndjtcblxuICAvLyBndWVzcyBuYW1lXG4gIHRoaXMuX25hbWUgPSB0aGlzLl9uYW1lIHx8IGJhc2VuYW1lKGFyZ3ZbMV0sICcuanMnKTtcblxuICAvLyBnaXRodWItc3R5bGUgc3ViLWNvbW1hbmRzIHdpdGggbm8gc3ViLWNvbW1hbmRcbiAgaWYgKHRoaXMuZXhlY3V0YWJsZXMgJiYgYXJndi5sZW5ndGggPCAzKSB7XG4gICAgLy8gdGhpcyB1c2VyIG5lZWRzIGhlbHBcbiAgICBhcmd2LnB1c2goJy0taGVscCcpO1xuICB9XG5cbiAgLy8gcHJvY2VzcyBhcmd2XG4gIHZhciBwYXJzZWQgPSB0aGlzLnBhcnNlT3B0aW9ucyh0aGlzLm5vcm1hbGl6ZShhcmd2LnNsaWNlKDIpKSk7XG4gIHZhciBhcmdzID0gdGhpcy5hcmdzID0gcGFyc2VkLmFyZ3M7XG5cbiAgdmFyIHJlc3VsdCA9IHRoaXMucGFyc2VBcmdzKHRoaXMuYXJncywgcGFyc2VkLnVua25vd24pO1xuXG4gIC8vIGV4ZWN1dGFibGUgc3ViLWNvbW1hbmRzXG4gIHZhciBuYW1lID0gcmVzdWx0LmFyZ3NbMF07XG4gIGlmICh0aGlzLl9leGVjc1tuYW1lXSAmJiB0eXBlb2YgdGhpcy5fZXhlY3NbbmFtZV0gIT0gXCJmdW5jdGlvblwiKSB7XG4gICAgcmV0dXJuIHRoaXMuZXhlY3V0ZVN1YkNvbW1hbmQoYXJndiwgYXJncywgcGFyc2VkLnVua25vd24pO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogRXhlY3V0ZSBhIHN1Yi1jb21tYW5kIGV4ZWN1dGFibGUuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJndlxuICogQHBhcmFtIHtBcnJheX0gYXJnc1xuICogQHBhcmFtIHtBcnJheX0gdW5rbm93blxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUuZXhlY3V0ZVN1YkNvbW1hbmQgPSBmdW5jdGlvbihhcmd2LCBhcmdzLCB1bmtub3duKSB7XG4gIGFyZ3MgPSBhcmdzLmNvbmNhdCh1bmtub3duKTtcblxuICBpZiAoIWFyZ3MubGVuZ3RoKSB0aGlzLmhlbHAoKTtcbiAgaWYgKCdoZWxwJyA9PSBhcmdzWzBdICYmIDEgPT0gYXJncy5sZW5ndGgpIHRoaXMuaGVscCgpO1xuXG4gIC8vIDxjbWQ+IC0taGVscFxuICBpZiAoJ2hlbHAnID09IGFyZ3NbMF0pIHtcbiAgICBhcmdzWzBdID0gYXJnc1sxXTtcbiAgICBhcmdzWzFdID0gJy0taGVscCc7XG4gIH1cblxuICAvLyBleGVjdXRhYmxlXG4gIHZhciBmID0gYXJndlsxXTtcbiAgLy8gbmFtZSBvZiB0aGUgc3ViY29tbWFuZCwgbGluayBgcG0taW5zdGFsbGBcbiAgdmFyIGJpbiA9IGJhc2VuYW1lKGYsICcuanMnKSArICctJyArIGFyZ3NbMF07XG5cblxuICAvLyBJbiBjYXNlIG9mIGdsb2JhbGx5IGluc3RhbGxlZCwgZ2V0IHRoZSBiYXNlIGRpciB3aGVyZSBleGVjdXRhYmxlXG4gIC8vICBzdWJjb21tYW5kIGZpbGUgc2hvdWxkIGJlIGxvY2F0ZWQgYXRcbiAgdmFyIGJhc2VEaXJcbiAgICAsIGxpbmsgPSByZWFkbGluayhmKTtcblxuICAvLyB3aGVuIHN5bWJvbGluayBpcyByZWxhdGl2ZSBwYXRoXG4gIGlmIChsaW5rICE9PSBmICYmIGxpbmsuY2hhckF0KDApICE9PSAnLycpIHtcbiAgICBsaW5rID0gcGF0aC5qb2luKGRpcm5hbWUoZiksIGxpbmspXG4gIH1cbiAgYmFzZURpciA9IGRpcm5hbWUobGluayk7XG5cbiAgLy8gcHJlZmVyIGxvY2FsIGAuLzxiaW4+YCB0byBiaW4gaW4gdGhlICRQQVRIXG4gIHZhciBsb2NhbEJpbiA9IHBhdGguam9pbihiYXNlRGlyLCBiaW4pO1xuXG4gIC8vIHdoZXRoZXIgYmluIGZpbGUgaXMgYSBqcyBzY3JpcHQgd2l0aCBleHBsaWNpdCBgLmpzYCBleHRlbnNpb25cbiAgdmFyIGlzRXhwbGljaXRKUyA9IGZhbHNlO1xuICBpZiAoZXhpc3RzKGxvY2FsQmluICsgJy5qcycpKSB7XG4gICAgYmluID0gbG9jYWxCaW4gKyAnLmpzJztcbiAgICBpc0V4cGxpY2l0SlMgPSB0cnVlO1xuICB9IGVsc2UgaWYgKGV4aXN0cyhsb2NhbEJpbikpIHtcbiAgICBiaW4gPSBsb2NhbEJpbjtcbiAgfVxuXG4gIGFyZ3MgPSBhcmdzLnNsaWNlKDEpO1xuXG4gIHZhciBwcm9jO1xuICBpZiAocHJvY2Vzcy5wbGF0Zm9ybSAhPT0gJ3dpbjMyJykge1xuICAgIGlmIChpc0V4cGxpY2l0SlMpIHtcbiAgICAgIGFyZ3MudW5zaGlmdChsb2NhbEJpbik7XG4gICAgICAvLyBhZGQgZXhlY3V0YWJsZSBhcmd1bWVudHMgdG8gc3Bhd25cbiAgICAgIGFyZ3MgPSAocHJvY2Vzcy5leGVjQXJndiB8fCBbXSkuY29uY2F0KGFyZ3MpO1xuXG4gICAgICBwcm9jID0gc3Bhd24oJ25vZGUnLCBhcmdzLCB7IHN0ZGlvOiAnaW5oZXJpdCcsIGN1c3RvbUZkczogWzAsIDEsIDJdIH0pO1xuICAgIH0gZWxzZSB7XG4gICAgICBwcm9jID0gc3Bhd24oYmluLCBhcmdzLCB7IHN0ZGlvOiAnaW5oZXJpdCcsIGN1c3RvbUZkczogWzAsIDEsIDJdIH0pO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBhcmdzLnVuc2hpZnQobG9jYWxCaW4pO1xuICAgIHByb2MgPSBzcGF3bihwcm9jZXNzLmV4ZWNQYXRoLCBhcmdzLCB7IHN0ZGlvOiAnaW5oZXJpdCd9KTtcbiAgfVxuXG4gIHByb2Mub24oJ2Nsb3NlJywgcHJvY2Vzcy5leGl0LmJpbmQocHJvY2VzcykpO1xuICBwcm9jLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGVycikge1xuICAgIGlmIChlcnIuY29kZSA9PSBcIkVOT0VOVFwiKSB7XG4gICAgICBjb25zb2xlLmVycm9yKCdcXG4gICVzKDEpIGRvZXMgbm90IGV4aXN0LCB0cnkgLS1oZWxwXFxuJywgYmluKTtcbiAgICB9IGVsc2UgaWYgKGVyci5jb2RlID09IFwiRUFDQ0VTXCIpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ1xcbiAgJXMoMSkgbm90IGV4ZWN1dGFibGUuIHRyeSBjaG1vZCBvciBydW4gd2l0aCByb290XFxuJywgYmluKTtcbiAgICB9XG4gICAgcHJvY2Vzcy5leGl0KDEpO1xuICB9KTtcblxuICB0aGlzLnJ1bm5pbmdDb21tYW5kID0gcHJvYztcbn07XG5cbi8qKlxuICogTm9ybWFsaXplIGBhcmdzYCwgc3BsaXR0aW5nIGpvaW5lZCBzaG9ydCBmbGFncy4gRm9yIGV4YW1wbGVcbiAqIHRoZSBhcmcgXCItYWJjXCIgaXMgZXF1aXZhbGVudCB0byBcIi1hIC1iIC1jXCIuXG4gKiBUaGlzIGFsc28gbm9ybWFsaXplcyBlcXVhbCBzaWduIGFuZCBzcGxpdHMgXCItLWFiYz1kZWZcIiBpbnRvIFwiLS1hYmMgZGVmXCIuXG4gKlxuICogQHBhcmFtIHtBcnJheX0gYXJnc1xuICogQHJldHVybiB7QXJyYXl9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5ub3JtYWxpemUgPSBmdW5jdGlvbihhcmdzKSB7XG4gIHZhciByZXQgPSBbXVxuICAgICwgYXJnXG4gICAgLCBsYXN0T3B0XG4gICAgLCBpbmRleDtcblxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gYXJncy5sZW5ndGg7IGkgPCBsZW47ICsraSkge1xuICAgIGFyZyA9IGFyZ3NbaV07XG4gICAgaWYgKGkgPiAwKSB7XG4gICAgICBsYXN0T3B0ID0gdGhpcy5vcHRpb25Gb3IoYXJnc1tpLTFdKTtcbiAgICB9XG5cbiAgICBpZiAoYXJnID09PSAnLS0nKSB7XG4gICAgICAvLyBIb25vciBvcHRpb24gdGVybWluYXRvclxuICAgICAgcmV0ID0gcmV0LmNvbmNhdChhcmdzLnNsaWNlKGkpKTtcbiAgICAgIGJyZWFrO1xuICAgIH0gZWxzZSBpZiAobGFzdE9wdCAmJiBsYXN0T3B0LnJlcXVpcmVkKSB7XG4gICAgICByZXQucHVzaChhcmcpO1xuICAgIH0gZWxzZSBpZiAoYXJnLmxlbmd0aCA+IDEgJiYgJy0nID09IGFyZ1swXSAmJiAnLScgIT0gYXJnWzFdKSB7XG4gICAgICBhcmcuc2xpY2UoMSkuc3BsaXQoJycpLmZvckVhY2goZnVuY3Rpb24oYykge1xuICAgICAgICByZXQucHVzaCgnLScgKyBjKTtcbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAoL14tLS8udGVzdChhcmcpICYmIH4oaW5kZXggPSBhcmcuaW5kZXhPZignPScpKSkge1xuICAgICAgcmV0LnB1c2goYXJnLnNsaWNlKDAsIGluZGV4KSwgYXJnLnNsaWNlKGluZGV4ICsgMSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXQucHVzaChhcmcpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXQ7XG59O1xuXG4vKipcbiAqIFBhcnNlIGNvbW1hbmQgYGFyZ3NgLlxuICpcbiAqIFdoZW4gbGlzdGVuZXIocykgYXJlIGF2YWlsYWJsZSB0aG9zZVxuICogY2FsbGJhY2tzIGFyZSBpbnZva2VkLCBvdGhlcndpc2UgdGhlIFwiKlwiXG4gKiBldmVudCBpcyBlbWl0dGVkIGFuZCB0aG9zZSBhY3Rpb25zIGFyZSBpbnZva2VkLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3NcbiAqIEByZXR1cm4ge0NvbW1hbmR9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUucGFyc2VBcmdzID0gZnVuY3Rpb24oYXJncywgdW5rbm93bikge1xuICB2YXIgbmFtZTtcblxuICBpZiAoYXJncy5sZW5ndGgpIHtcbiAgICBuYW1lID0gYXJnc1swXTtcbiAgICBpZiAodGhpcy5saXN0ZW5lcnMobmFtZSkubGVuZ3RoKSB7XG4gICAgICB0aGlzLmVtaXQoYXJncy5zaGlmdCgpLCBhcmdzLCB1bmtub3duKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhpcy5lbWl0KCcqJywgYXJncyk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIG91dHB1dEhlbHBJZk5lY2Vzc2FyeSh0aGlzLCB1bmtub3duKTtcblxuICAgIC8vIElmIHRoZXJlIHdlcmUgbm8gYXJncyBhbmQgd2UgaGF2ZSB1bmtub3duIG9wdGlvbnMsXG4gICAgLy8gdGhlbiB0aGV5IGFyZSBleHRyYW5lb3VzIGFuZCB3ZSBuZWVkIHRvIGVycm9yLlxuICAgIGlmICh1bmtub3duLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMudW5rbm93bk9wdGlvbih1bmtub3duWzBdKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJuIGFuIG9wdGlvbiBtYXRjaGluZyBgYXJnYCBpZiBhbnkuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGFyZ1xuICogQHJldHVybiB7T3B0aW9ufVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUub3B0aW9uRm9yID0gZnVuY3Rpb24oYXJnKSB7XG4gIGZvciAodmFyIGkgPSAwLCBsZW4gPSB0aGlzLm9wdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyArK2kpIHtcbiAgICBpZiAodGhpcy5vcHRpb25zW2ldLmlzKGFyZykpIHtcbiAgICAgIHJldHVybiB0aGlzLm9wdGlvbnNbaV07XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIFBhcnNlIG9wdGlvbnMgZnJvbSBgYXJndmAgcmV0dXJuaW5nIGBhcmd2YFxuICogdm9pZCBvZiB0aGVzZSBvcHRpb25zLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGFyZ3ZcbiAqIEByZXR1cm4ge0FycmF5fVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5wYXJzZU9wdGlvbnMgPSBmdW5jdGlvbihhcmd2KSB7XG4gIHZhciBhcmdzID0gW11cbiAgICAsIGxlbiA9IGFyZ3YubGVuZ3RoXG4gICAgLCBsaXRlcmFsXG4gICAgLCBvcHRpb25cbiAgICAsIGFyZztcblxuICB2YXIgdW5rbm93bk9wdGlvbnMgPSBbXTtcblxuICAvLyBwYXJzZSBvcHRpb25zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICBhcmcgPSBhcmd2W2ldO1xuXG4gICAgLy8gbGl0ZXJhbCBhcmdzIGFmdGVyIC0tXG4gICAgaWYgKCctLScgPT0gYXJnKSB7XG4gICAgICBsaXRlcmFsID0gdHJ1ZTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChsaXRlcmFsKSB7XG4gICAgICBhcmdzLnB1c2goYXJnKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIGZpbmQgbWF0Y2hpbmcgT3B0aW9uXG4gICAgb3B0aW9uID0gdGhpcy5vcHRpb25Gb3IoYXJnKTtcblxuICAgIC8vIG9wdGlvbiBpcyBkZWZpbmVkXG4gICAgaWYgKG9wdGlvbikge1xuICAgICAgLy8gcmVxdWlyZXMgYXJnXG4gICAgICBpZiAob3B0aW9uLnJlcXVpcmVkKSB7XG4gICAgICAgIGFyZyA9IGFyZ3ZbKytpXTtcbiAgICAgICAgaWYgKG51bGwgPT0gYXJnKSByZXR1cm4gdGhpcy5vcHRpb25NaXNzaW5nQXJndW1lbnQob3B0aW9uKTtcbiAgICAgICAgdGhpcy5lbWl0KG9wdGlvbi5uYW1lKCksIGFyZyk7XG4gICAgICAvLyBvcHRpb25hbCBhcmdcbiAgICAgIH0gZWxzZSBpZiAob3B0aW9uLm9wdGlvbmFsKSB7XG4gICAgICAgIGFyZyA9IGFyZ3ZbaSsxXTtcbiAgICAgICAgaWYgKG51bGwgPT0gYXJnIHx8ICgnLScgPT0gYXJnWzBdICYmICctJyAhPSBhcmcpKSB7XG4gICAgICAgICAgYXJnID0gbnVsbDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICArK2k7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5lbWl0KG9wdGlvbi5uYW1lKCksIGFyZyk7XG4gICAgICAvLyBib29sXG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQob3B0aW9uLm5hbWUoKSk7XG4gICAgICB9XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBsb29rcyBsaWtlIGFuIG9wdGlvblxuICAgIGlmIChhcmcubGVuZ3RoID4gMSAmJiAnLScgPT0gYXJnWzBdKSB7XG4gICAgICB1bmtub3duT3B0aW9ucy5wdXNoKGFyZyk7XG5cbiAgICAgIC8vIElmIHRoZSBuZXh0IGFyZ3VtZW50IGxvb2tzIGxpa2UgaXQgbWlnaHQgYmVcbiAgICAgIC8vIGFuIGFyZ3VtZW50IGZvciB0aGlzIG9wdGlvbiwgd2UgcGFzcyBpdCBvbi5cbiAgICAgIC8vIElmIGl0IGlzbid0LCB0aGVuIGl0J2xsIHNpbXBseSBiZSBpZ25vcmVkXG4gICAgICBpZiAoYXJndltpKzFdICYmICctJyAhPSBhcmd2W2krMV1bMF0pIHtcbiAgICAgICAgdW5rbm93bk9wdGlvbnMucHVzaChhcmd2WysraV0pO1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gYXJnXG4gICAgYXJncy5wdXNoKGFyZyk7XG4gIH1cblxuICByZXR1cm4geyBhcmdzOiBhcmdzLCB1bmtub3duOiB1bmtub3duT3B0aW9ucyB9O1xufTtcblxuLyoqXG4gKiBSZXR1cm4gYW4gb2JqZWN0IGNvbnRhaW5pbmcgb3B0aW9ucyBhcyBrZXktdmFsdWUgcGFpcnNcbiAqXG4gKiBAcmV0dXJuIHtPYmplY3R9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5Db21tYW5kLnByb3RvdHlwZS5vcHRzID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXN1bHQgPSB7fVxuICAgICwgbGVuID0gdGhpcy5vcHRpb25zLmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMCA7IGkgPCBsZW47IGkrKykge1xuICAgIHZhciBrZXkgPSBjYW1lbGNhc2UodGhpcy5vcHRpb25zW2ldLm5hbWUoKSk7XG4gICAgcmVzdWx0W2tleV0gPSBrZXkgPT09ICd2ZXJzaW9uJyA/IHRoaXMuX3ZlcnNpb24gOiB0aGlzW2tleV07XG4gIH1cbiAgcmV0dXJuIHJlc3VsdDtcbn07XG5cbi8qKlxuICogQXJndW1lbnQgYG5hbWVgIGlzIG1pc3NpbmcuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLm1pc3NpbmdBcmd1bWVudCA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgY29uc29sZS5lcnJvcigpO1xuICBjb25zb2xlLmVycm9yKFwiICBlcnJvcjogbWlzc2luZyByZXF1aXJlZCBhcmd1bWVudCBgJXMnXCIsIG5hbWUpO1xuICBjb25zb2xlLmVycm9yKCk7XG4gIHByb2Nlc3MuZXhpdCgxKTtcbn07XG5cbi8qKlxuICogYE9wdGlvbmAgaXMgbWlzc2luZyBhbiBhcmd1bWVudCwgYnV0IHJlY2VpdmVkIGBmbGFnYCBvciBub3RoaW5nLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBvcHRpb25cbiAqIEBwYXJhbSB7U3RyaW5nfSBmbGFnXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5vcHRpb25NaXNzaW5nQXJndW1lbnQgPSBmdW5jdGlvbihvcHRpb24sIGZsYWcpIHtcbiAgY29uc29sZS5lcnJvcigpO1xuICBpZiAoZmxhZykge1xuICAgIGNvbnNvbGUuZXJyb3IoXCIgIGVycm9yOiBvcHRpb24gYCVzJyBhcmd1bWVudCBtaXNzaW5nLCBnb3QgYCVzJ1wiLCBvcHRpb24uZmxhZ3MsIGZsYWcpO1xuICB9IGVsc2Uge1xuICAgIGNvbnNvbGUuZXJyb3IoXCIgIGVycm9yOiBvcHRpb24gYCVzJyBhcmd1bWVudCBtaXNzaW5nXCIsIG9wdGlvbi5mbGFncyk7XG4gIH1cbiAgY29uc29sZS5lcnJvcigpO1xuICBwcm9jZXNzLmV4aXQoMSk7XG59O1xuXG4vKipcbiAqIFVua25vd24gb3B0aW9uIGBmbGFnYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gZmxhZ1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUudW5rbm93bk9wdGlvbiA9IGZ1bmN0aW9uKGZsYWcpIHtcbiAgaWYgKHRoaXMuX2FsbG93VW5rbm93bk9wdGlvbikgcmV0dXJuO1xuICBjb25zb2xlLmVycm9yKCk7XG4gIGNvbnNvbGUuZXJyb3IoXCIgIGVycm9yOiB1bmtub3duIG9wdGlvbiBgJXMnXCIsIGZsYWcpO1xuICBjb25zb2xlLmVycm9yKCk7XG4gIHByb2Nlc3MuZXhpdCgxKTtcbn07XG5cbi8qKlxuICogVmFyaWFkaWMgYXJndW1lbnQgd2l0aCBgbmFtZWAgaXMgbm90IHRoZSBsYXN0IGFyZ3VtZW50IGFzIHJlcXVpcmVkLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS52YXJpYWRpY0FyZ05vdExhc3QgPSBmdW5jdGlvbihuYW1lKSB7XG4gIGNvbnNvbGUuZXJyb3IoKTtcbiAgY29uc29sZS5lcnJvcihcIiAgZXJyb3I6IHZhcmlhZGljIGFyZ3VtZW50cyBtdXN0IGJlIGxhc3QgYCVzJ1wiLCBuYW1lKTtcbiAgY29uc29sZS5lcnJvcigpO1xuICBwcm9jZXNzLmV4aXQoMSk7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgcHJvZ3JhbSB2ZXJzaW9uIHRvIGBzdHJgLlxuICpcbiAqIFRoaXMgbWV0aG9kIGF1dG8tcmVnaXN0ZXJzIHRoZSBcIi1WLCAtLXZlcnNpb25cIiBmbGFnXG4gKiB3aGljaCB3aWxsIHByaW50IHRoZSB2ZXJzaW9uIG51bWJlciB3aGVuIHBhc3NlZC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcGFyYW0ge1N0cmluZ30gZmxhZ3NcbiAqIEByZXR1cm4ge0NvbW1hbmR9IGZvciBjaGFpbmluZ1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS52ZXJzaW9uID0gZnVuY3Rpb24oc3RyLCBmbGFncykge1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdmVyc2lvbjtcbiAgdGhpcy5fdmVyc2lvbiA9IHN0cjtcbiAgZmxhZ3MgPSBmbGFncyB8fCAnLVYsIC0tdmVyc2lvbic7XG4gIHRoaXMub3B0aW9uKGZsYWdzLCAnb3V0cHV0IHRoZSB2ZXJzaW9uIG51bWJlcicpO1xuICB0aGlzLm9uKCd2ZXJzaW9uJywgZnVuY3Rpb24oKSB7XG4gICAgcHJvY2Vzcy5zdGRvdXQud3JpdGUoc3RyICsgJ1xcbicpO1xuICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgfSk7XG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBTZXQgdGhlIGRlc2NyaXB0aW9uIHRvIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ3xDb21tYW5kfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5kZXNjcmlwdGlvbiA9IGZ1bmN0aW9uKHN0cikge1xuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fZGVzY3JpcHRpb247XG4gIHRoaXMuX2Rlc2NyaXB0aW9uID0gc3RyO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IGFuIGFsaWFzIGZvciB0aGUgY29tbWFuZFxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBhbGlhc1xuICogQHJldHVybiB7U3RyaW5nfENvbW1hbmR9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLmFsaWFzID0gZnVuY3Rpb24oYWxpYXMpIHtcbiAgaWYgKDAgPT0gYXJndW1lbnRzLmxlbmd0aCkgcmV0dXJuIHRoaXMuX2FsaWFzO1xuICB0aGlzLl9hbGlhcyA9IGFsaWFzO1xuICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogU2V0IC8gZ2V0IHRoZSBjb21tYW5kIHVzYWdlIGBzdHJgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge1N0cmluZ3xDb21tYW5kfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS51c2FnZSA9IGZ1bmN0aW9uKHN0cikge1xuICB2YXIgYXJncyA9IHRoaXMuX2FyZ3MubWFwKGZ1bmN0aW9uKGFyZykge1xuICAgIHJldHVybiBodW1hblJlYWRhYmxlQXJnTmFtZShhcmcpO1xuICB9KTtcblxuICB2YXIgdXNhZ2UgPSAnW29wdGlvbnNdJ1xuICAgICsgKHRoaXMuY29tbWFuZHMubGVuZ3RoID8gJyBbY29tbWFuZF0nIDogJycpXG4gICAgKyAodGhpcy5fYXJncy5sZW5ndGggPyAnICcgKyBhcmdzLmpvaW4oJyAnKSA6ICcnKTtcblxuICBpZiAoMCA9PSBhcmd1bWVudHMubGVuZ3RoKSByZXR1cm4gdGhpcy5fdXNhZ2UgfHwgdXNhZ2U7XG4gIHRoaXMuX3VzYWdlID0gc3RyO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBHZXQgdGhlIG5hbWUgb2YgdGhlIGNvbW1hbmRcbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7U3RyaW5nfENvbW1hbmR9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLm5hbWUgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMuX25hbWU7XG59O1xuXG4vKipcbiAqIFJldHVybiB0aGUgbGFyZ2VzdCBvcHRpb24gbGVuZ3RoLlxuICpcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLmxhcmdlc3RPcHRpb25MZW5ndGggPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHRoaXMub3B0aW9ucy5yZWR1Y2UoZnVuY3Rpb24obWF4LCBvcHRpb24pIHtcbiAgICByZXR1cm4gTWF0aC5tYXgobWF4LCBvcHRpb24uZmxhZ3MubGVuZ3RoKTtcbiAgfSwgMCk7XG59O1xuXG4vKipcbiAqIFJldHVybiBoZWxwIGZvciBvcHRpb25zLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLm9wdGlvbkhlbHAgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHdpZHRoID0gdGhpcy5sYXJnZXN0T3B0aW9uTGVuZ3RoKCk7XG5cbiAgLy8gUHJlcGVuZCB0aGUgaGVscCBpbmZvcm1hdGlvblxuICByZXR1cm4gW3BhZCgnLWgsIC0taGVscCcsIHdpZHRoKSArICcgICcgKyAnb3V0cHV0IHVzYWdlIGluZm9ybWF0aW9uJ11cbiAgICAuY29uY2F0KHRoaXMub3B0aW9ucy5tYXAoZnVuY3Rpb24ob3B0aW9uKSB7XG4gICAgICByZXR1cm4gcGFkKG9wdGlvbi5mbGFncywgd2lkdGgpICsgJyAgJyArIG9wdGlvbi5kZXNjcmlwdGlvbjtcbiAgICAgIH0pKVxuICAgIC5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogUmV0dXJuIGNvbW1hbmQgaGVscCBkb2N1bWVudGF0aW9uLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLmNvbW1hbmRIZWxwID0gZnVuY3Rpb24oKSB7XG4gIGlmICghdGhpcy5jb21tYW5kcy5sZW5ndGgpIHJldHVybiAnJztcblxuICB2YXIgY29tbWFuZHMgPSB0aGlzLmNvbW1hbmRzLmZpbHRlcihmdW5jdGlvbihjbWQpIHtcbiAgICByZXR1cm4gIWNtZC5fbm9IZWxwO1xuICB9KS5tYXAoZnVuY3Rpb24oY21kKSB7XG4gICAgdmFyIGFyZ3MgPSBjbWQuX2FyZ3MubWFwKGZ1bmN0aW9uKGFyZykge1xuICAgICAgcmV0dXJuIGh1bWFuUmVhZGFibGVBcmdOYW1lKGFyZyk7XG4gICAgfSkuam9pbignICcpO1xuXG4gICAgcmV0dXJuIFtcbiAgICAgIGNtZC5fbmFtZVxuICAgICAgICArIChjbWQuX2FsaWFzXG4gICAgICAgICAgPyAnfCcgKyBjbWQuX2FsaWFzXG4gICAgICAgICAgOiAnJylcbiAgICAgICAgKyAoY21kLm9wdGlvbnMubGVuZ3RoXG4gICAgICAgICAgPyAnIFtvcHRpb25zXSdcbiAgICAgICAgICA6ICcnKVxuICAgICAgICArICcgJyArIGFyZ3NcbiAgICAsIGNtZC5kZXNjcmlwdGlvbigpXG4gICAgXTtcbiAgfSk7XG5cbiAgdmFyIHdpZHRoID0gY29tbWFuZHMucmVkdWNlKGZ1bmN0aW9uKG1heCwgY29tbWFuZCkge1xuICAgIHJldHVybiBNYXRoLm1heChtYXgsIGNvbW1hbmRbMF0ubGVuZ3RoKTtcbiAgfSwgMCk7XG5cbiAgcmV0dXJuIFtcbiAgICAgICcnXG4gICAgLCAnICBDb21tYW5kczonXG4gICAgLCAnJ1xuICAgICwgY29tbWFuZHMubWFwKGZ1bmN0aW9uKGNtZCkge1xuICAgICAgcmV0dXJuIHBhZChjbWRbMF0sIHdpZHRoKSArICcgICcgKyBjbWRbMV07XG4gICAgfSkuam9pbignXFxuJykucmVwbGFjZSgvXi9nbSwgJyAgICAnKVxuICAgICwgJydcbiAgXS5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogUmV0dXJuIHByb2dyYW0gaGVscCBkb2N1bWVudGF0aW9uLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbkNvbW1hbmQucHJvdG90eXBlLmhlbHBJbmZvcm1hdGlvbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgZGVzYyA9IFtdO1xuICBpZiAodGhpcy5fZGVzY3JpcHRpb24pIHtcbiAgICBkZXNjID0gW1xuICAgICAgJyAgJyArIHRoaXMuX2Rlc2NyaXB0aW9uXG4gICAgICAsICcnXG4gICAgXTtcbiAgfVxuXG4gIHZhciBjbWROYW1lID0gdGhpcy5fbmFtZTtcbiAgaWYgKHRoaXMuX2FsaWFzKSB7XG4gICAgY21kTmFtZSA9IGNtZE5hbWUgKyAnfCcgKyB0aGlzLl9hbGlhcztcbiAgfVxuICB2YXIgdXNhZ2UgPSBbXG4gICAgJydcbiAgICAsJyAgVXNhZ2U6ICcgKyBjbWROYW1lICsgJyAnICsgdGhpcy51c2FnZSgpXG4gICAgLCAnJ1xuICBdO1xuXG4gIHZhciBjbWRzID0gW107XG4gIHZhciBjb21tYW5kSGVscCA9IHRoaXMuY29tbWFuZEhlbHAoKTtcbiAgaWYgKGNvbW1hbmRIZWxwKSBjbWRzID0gW2NvbW1hbmRIZWxwXTtcblxuICB2YXIgb3B0aW9ucyA9IFtcbiAgICAnICBPcHRpb25zOidcbiAgICAsICcnXG4gICAgLCAnJyArIHRoaXMub3B0aW9uSGVscCgpLnJlcGxhY2UoL14vZ20sICcgICAgJylcbiAgICAsICcnXG4gICAgLCAnJ1xuICBdO1xuXG4gIHJldHVybiB1c2FnZVxuICAgIC5jb25jYXQoY21kcylcbiAgICAuY29uY2F0KGRlc2MpXG4gICAgLmNvbmNhdChvcHRpb25zKVxuICAgIC5qb2luKCdcXG4nKTtcbn07XG5cbi8qKlxuICogT3V0cHV0IGhlbHAgaW5mb3JtYXRpb24gZm9yIHRoaXMgY29tbWFuZFxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuQ29tbWFuZC5wcm90b3R5cGUub3V0cHV0SGVscCA9IGZ1bmN0aW9uKCkge1xuICBwcm9jZXNzLnN0ZG91dC53cml0ZSh0aGlzLmhlbHBJbmZvcm1hdGlvbigpKTtcbiAgdGhpcy5lbWl0KCctLWhlbHAnKTtcbn07XG5cbi8qKlxuICogT3V0cHV0IGhlbHAgaW5mb3JtYXRpb24gYW5kIGV4aXQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5Db21tYW5kLnByb3RvdHlwZS5oZWxwID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMub3V0cHV0SGVscCgpO1xuICBwcm9jZXNzLmV4aXQoKTtcbn07XG5cbi8qKlxuICogQ2FtZWwtY2FzZSB0aGUgZ2l2ZW4gYGZsYWdgXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGZsYWdcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNhbWVsY2FzZShmbGFnKSB7XG4gIHJldHVybiBmbGFnLnNwbGl0KCctJykucmVkdWNlKGZ1bmN0aW9uKHN0ciwgd29yZCkge1xuICAgIHJldHVybiBzdHIgKyB3b3JkWzBdLnRvVXBwZXJDYXNlKCkgKyB3b3JkLnNsaWNlKDEpO1xuICB9KTtcbn1cblxuLyoqXG4gKiBQYWQgYHN0cmAgdG8gYHdpZHRoYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcGFyYW0ge051bWJlcn0gd2lkdGhcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhZChzdHIsIHdpZHRoKSB7XG4gIHZhciBsZW4gPSBNYXRoLm1heCgwLCB3aWR0aCAtIHN0ci5sZW5ndGgpO1xuICByZXR1cm4gc3RyICsgQXJyYXkobGVuICsgMSkuam9pbignICcpO1xufVxuXG4vKipcbiAqIE91dHB1dCBoZWxwIGluZm9ybWF0aW9uIGlmIG5lY2Vzc2FyeVxuICpcbiAqIEBwYXJhbSB7Q29tbWFuZH0gY29tbWFuZCB0byBvdXRwdXQgaGVscCBmb3JcbiAqIEBwYXJhbSB7QXJyYXl9IGFycmF5IG9mIG9wdGlvbnMgdG8gc2VhcmNoIGZvciAtaCBvciAtLWhlbHBcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIG91dHB1dEhlbHBJZk5lY2Vzc2FyeShjbWQsIG9wdGlvbnMpIHtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwgW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgb3B0aW9ucy5sZW5ndGg7IGkrKykge1xuICAgIGlmIChvcHRpb25zW2ldID09ICctLWhlbHAnIHx8IG9wdGlvbnNbaV0gPT0gJy1oJykge1xuICAgICAgY21kLm91dHB1dEhlbHAoKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgwKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBUYWtlcyBhbiBhcmd1bWVudCBhbiByZXR1cm5zIGl0cyBodW1hbiByZWFkYWJsZSBlcXVpdmFsZW50IGZvciBoZWxwIHVzYWdlLlxuICpcbiAqIEBwYXJhbSB7T2JqZWN0fSBhcmdcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGh1bWFuUmVhZGFibGVBcmdOYW1lKGFyZykge1xuICB2YXIgbmFtZU91dHB1dCA9IGFyZy5uYW1lICsgKGFyZy52YXJpYWRpYyA9PT0gdHJ1ZSA/ICcuLi4nIDogJycpO1xuXG4gIHJldHVybiBhcmcucmVxdWlyZWRcbiAgICA/ICc8JyArIG5hbWVPdXRwdXQgKyAnPidcbiAgICA6ICdbJyArIG5hbWVPdXRwdXQgKyAnXSdcbn1cblxuLy8gZm9yIHZlcnNpb25zIGJlZm9yZSBub2RlIHYwLjggd2hlbiB0aGVyZSB3ZXJlbid0IGBmcy5leGlzdHNTeW5jYFxuZnVuY3Rpb24gZXhpc3RzKGZpbGUpIHtcbiAgdHJ5IHtcbiAgICBpZiAoZnMuc3RhdFN5bmMoZmlsZSkuaXNGaWxlKCkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuXG4iLG51bGwsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIHRoaXMuX2V2ZW50cyA9IHRoaXMuX2V2ZW50cyB8fCB7fTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gdGhpcy5fbWF4TGlzdGVuZXJzIHx8IHVuZGVmaW5lZDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxuRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xuICBpZiAoIWlzTnVtYmVyKG4pIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IFR5cGVFcnJvcignbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgZXIsIGhhbmRsZXIsIGxlbiwgYXJncywgaSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cy5lcnJvciB8fFxuICAgICAgICAoaXNPYmplY3QodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpIHtcbiAgICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgICAgaWYgKGVyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9XG4gICAgICB0aHJvdyBUeXBlRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuJyk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNVbmRlZmluZWQoaGFuZGxlcikpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoaXNPYmplY3QoaGFuZGxlcikpIHtcbiAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG5cbiAgICBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG4gICAgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PT0gXCJuZXdMaXN0ZW5lclwiISBCZWZvcmVcbiAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lclwiLlxuICBpZiAodGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKVxuICAgIHRoaXMuZW1pdCgnbmV3TGlzdGVuZXInLCB0eXBlLFxuICAgICAgICAgICAgICBpc0Z1bmN0aW9uKGxpc3RlbmVyLmxpc3RlbmVyKSA/XG4gICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyIDogbGlzdGVuZXIpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICBlbHNlIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFwcGVuZC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIGVsc2VcbiAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcl07XG5cbiAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcbiAgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkgJiYgIXRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQpIHtcbiAgICB2YXIgbTtcbiAgICBpZiAoIWlzVW5kZWZpbmVkKHRoaXMuX21heExpc3RlbmVycykpIHtcbiAgICAgIG0gPSB0aGlzLl9tYXhMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSBFdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycztcbiAgICB9XG5cbiAgICBpZiAobSAmJiBtID4gMCAmJiB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoID4gbSkge1xuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmVycm9yKCcobm9kZSkgd2FybmluZzogcG9zc2libGUgRXZlbnRFbWl0dGVyIG1lbW9yeSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICVkIGxpc3RlbmVycyBhZGRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICdVc2UgZW1pdHRlci5zZXRNYXhMaXN0ZW5lcnMoKSB0byBpbmNyZWFzZSBsaW1pdC4nLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoKTtcbiAgICAgIGlmICh0eXBlb2YgY29uc29sZS50cmFjZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBub3Qgc3VwcG9ydGVkIGluIElFIDEwXG4gICAgICAgIGNvbnNvbGUudHJhY2UoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgdmFyIGZpcmVkID0gZmFsc2U7XG5cbiAgZnVuY3Rpb24gZygpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuXG4gICAgaWYgKCFmaXJlZCkge1xuICAgICAgZmlyZWQgPSB0cnVlO1xuICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cblxuICBnLmxpc3RlbmVyID0gbGlzdGVuZXI7XG4gIHRoaXMub24odHlwZSwgZyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBlbWl0cyBhICdyZW1vdmVMaXN0ZW5lcicgZXZlbnQgaWZmIHRoZSBsaXN0ZW5lciB3YXMgcmVtb3ZlZFxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBsaXN0LCBwb3NpdGlvbiwgbGVuZ3RoLCBpO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIGxpc3QgPSB0aGlzLl9ldmVudHNbdHlwZV07XG4gIGxlbmd0aCA9IGxpc3QubGVuZ3RoO1xuICBwb3NpdGlvbiA9IC0xO1xuXG4gIGlmIChsaXN0ID09PSBsaXN0ZW5lciB8fFxuICAgICAgKGlzRnVuY3Rpb24obGlzdC5saXN0ZW5lcikgJiYgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcblxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGxpc3QpKSB7XG4gICAgZm9yIChpID0gbGVuZ3RoOyBpLS0gPiAwOykge1xuICAgICAgaWYgKGxpc3RbaV0gPT09IGxpc3RlbmVyIHx8XG4gICAgICAgICAgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgICAgIHBvc2l0aW9uID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBvc2l0aW9uIDwgMClcbiAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXN0LnNwbGljZShwb3NpdGlvbiwgMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIga2V5LCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8gbm90IGxpc3RlbmluZyBmb3IgcmVtb3ZlTGlzdGVuZXIsIG5vIG5lZWQgdG8gZW1pdFxuICBpZiAoIXRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIGVtaXQgcmVtb3ZlTGlzdGVuZXIgZm9yIGFsbCBsaXN0ZW5lcnMgb24gYWxsIGV2ZW50c1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGZvciAoa2V5IGluIHRoaXMuX2V2ZW50cykge1xuICAgICAgaWYgKGtleSA9PT0gJ3JlbW92ZUxpc3RlbmVyJykgY29udGludWU7XG4gICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycyhrZXkpO1xuICAgIH1cbiAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycygncmVtb3ZlTGlzdGVuZXInKTtcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNGdW5jdGlvbihsaXN0ZW5lcnMpKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnMpO1xuICB9IGVsc2Uge1xuICAgIC8vIExJRk8gb3JkZXJcbiAgICB3aGlsZSAobGlzdGVuZXJzLmxlbmd0aClcbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXSk7XG4gIH1cbiAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IFtdO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XG4gIGVsc2VcbiAgICByZXQgPSB0aGlzLl9ldmVudHNbdHlwZV0uc2xpY2UoKTtcbiAgcmV0dXJuIHJldDtcbn07XG5cbkV2ZW50RW1pdHRlci5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIWVtaXR0ZXIuX2V2ZW50cyB8fCAhZW1pdHRlci5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IDA7XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24oZW1pdHRlci5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSAxO1xuICBlbHNlXG4gICAgcmV0ID0gZW1pdHRlci5fZXZlbnRzW3R5cGVdLmxlbmd0aDtcbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIFNwbGl0IGEgZmlsZW5hbWUgaW50byBbcm9vdCwgZGlyLCBiYXNlbmFtZSwgZXh0XSwgdW5peCB2ZXJzaW9uXG4vLyAncm9vdCcgaXMganVzdCBhIHNsYXNoLCBvciBub3RoaW5nLlxudmFyIHNwbGl0UGF0aFJlID1cbiAgICAvXihcXC8/fCkoW1xcc1xcU10qPykoKD86XFwuezEsMn18W15cXC9dKz98KShcXC5bXi5cXC9dKnwpKSg/OltcXC9dKikkLztcbnZhciBzcGxpdFBhdGggPSBmdW5jdGlvbihmaWxlbmFtZSkge1xuICByZXR1cm4gc3BsaXRQYXRoUmUuZXhlYyhmaWxlbmFtZSkuc2xpY2UoMSk7XG59O1xuXG4vLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlc29sdmUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlc29sdmVkUGF0aCA9ICcnLFxuICAgICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSA+PSAtMSAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG4gICAgdmFyIHBhdGggPSAoaSA+PSAwKSA/IGFyZ3VtZW50c1tpXSA6IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAvLyBTa2lwIGVtcHR5IGFuZCBpbnZhbGlkIGVudHJpZXNcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5yZXNvbHZlIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH0gZWxzZSBpZiAoIXBhdGgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckF0KDApID09PSAnLyc7XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gIC8vIGhhbmRsZSByZWxhdGl2ZSBwYXRocyB0byBiZSBzYWZlIChtaWdodCBoYXBwZW4gd2hlbiBwcm9jZXNzLmN3ZCgpIGZhaWxzKVxuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocmVzb2x2ZWRQYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIXJlc29sdmVkQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICByZXR1cm4gKChyZXNvbHZlZEFic29sdXRlID8gJy8nIDogJycpICsgcmVzb2x2ZWRQYXRoKSB8fCAnLic7XG59O1xuXG4vLyBwYXRoLm5vcm1hbGl6ZShwYXRoKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5ub3JtYWxpemUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciBpc0Fic29sdXRlID0gZXhwb3J0cy5pc0Fic29sdXRlKHBhdGgpLFxuICAgICAgdHJhaWxpbmdTbGFzaCA9IHN1YnN0cihwYXRoLCAtMSkgPT09ICcvJztcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIWlzQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICBpZiAoIXBhdGggJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBwYXRoID0gJy4nO1xuICB9XG4gIGlmIChwYXRoICYmIHRyYWlsaW5nU2xhc2gpIHtcbiAgICBwYXRoICs9ICcvJztcbiAgfVxuXG4gIHJldHVybiAoaXNBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHBhdGg7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmlzQWJzb2x1dGUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gIHJldHVybiBleHBvcnRzLm5vcm1hbGl6ZShmaWx0ZXIocGF0aHMsIGZ1bmN0aW9uKHAsIGluZGV4KSB7XG4gICAgaWYgKHR5cGVvZiBwICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGguam9pbiBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9XG4gICAgcmV0dXJuIHA7XG4gIH0pLmpvaW4oJy8nKSk7XG59O1xuXG5cbi8vIHBhdGgucmVsYXRpdmUoZnJvbSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlbGF0aXZlID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgZnJvbSA9IGV4cG9ydHMucmVzb2x2ZShmcm9tKS5zdWJzdHIoMSk7XG4gIHRvID0gZXhwb3J0cy5yZXNvbHZlKHRvKS5zdWJzdHIoMSk7XG5cbiAgZnVuY3Rpb24gdHJpbShhcnIpIHtcbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIGZvciAoOyBzdGFydCA8IGFyci5sZW5ndGg7IHN0YXJ0KyspIHtcbiAgICAgIGlmIChhcnJbc3RhcnRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGFyci5sZW5ndGggLSAxO1xuICAgIGZvciAoOyBlbmQgPj0gMDsgZW5kLS0pIHtcbiAgICAgIGlmIChhcnJbZW5kXSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzdGFydCA+IGVuZCkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIGVuZCAtIHN0YXJ0ICsgMSk7XG4gIH1cblxuICB2YXIgZnJvbVBhcnRzID0gdHJpbShmcm9tLnNwbGl0KCcvJykpO1xuICB2YXIgdG9QYXJ0cyA9IHRyaW0odG8uc3BsaXQoJy8nKSk7XG5cbiAgdmFyIGxlbmd0aCA9IE1hdGgubWluKGZyb21QYXJ0cy5sZW5ndGgsIHRvUGFydHMubGVuZ3RoKTtcbiAgdmFyIHNhbWVQYXJ0c0xlbmd0aCA9IGxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChmcm9tUGFydHNbaV0gIT09IHRvUGFydHNbaV0pIHtcbiAgICAgIHNhbWVQYXJ0c0xlbmd0aCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICB2YXIgb3V0cHV0UGFydHMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHNhbWVQYXJ0c0xlbmd0aDsgaSA8IGZyb21QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIG91dHB1dFBhcnRzLnB1c2goJy4uJyk7XG4gIH1cblxuICBvdXRwdXRQYXJ0cyA9IG91dHB1dFBhcnRzLmNvbmNhdCh0b1BhcnRzLnNsaWNlKHNhbWVQYXJ0c0xlbmd0aCkpO1xuXG4gIHJldHVybiBvdXRwdXRQYXJ0cy5qb2luKCcvJyk7XG59O1xuXG5leHBvcnRzLnNlcCA9ICcvJztcbmV4cG9ydHMuZGVsaW1pdGVyID0gJzonO1xuXG5leHBvcnRzLmRpcm5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciByZXN1bHQgPSBzcGxpdFBhdGgocGF0aCksXG4gICAgICByb290ID0gcmVzdWx0WzBdLFxuICAgICAgZGlyID0gcmVzdWx0WzFdO1xuXG4gIGlmICghcm9vdCAmJiAhZGlyKSB7XG4gICAgLy8gTm8gZGlybmFtZSB3aGF0c29ldmVyXG4gICAgcmV0dXJuICcuJztcbiAgfVxuXG4gIGlmIChkaXIpIHtcbiAgICAvLyBJdCBoYXMgYSBkaXJuYW1lLCBzdHJpcCB0cmFpbGluZyBzbGFzaFxuICAgIGRpciA9IGRpci5zdWJzdHIoMCwgZGlyLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIHJvb3QgKyBkaXI7XG59O1xuXG5cbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbihwYXRoLCBleHQpIHtcbiAgdmFyIGYgPSBzcGxpdFBhdGgocGF0aClbMl07XG4gIC8vIFRPRE86IG1ha2UgdGhpcyBjb21wYXJpc29uIGNhc2UtaW5zZW5zaXRpdmUgb24gd2luZG93cz9cbiAgaWYgKGV4dCAmJiBmLnN1YnN0cigtMSAqIGV4dC5sZW5ndGgpID09PSBleHQpIHtcbiAgICBmID0gZi5zdWJzdHIoMCwgZi5sZW5ndGggLSBleHQubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gZjtcbn07XG5cblxuZXhwb3J0cy5leHRuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gc3BsaXRQYXRoKHBhdGgpWzNdO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcbnZhciBxdWV1ZSA9IFtdO1xudmFyIGRyYWluaW5nID0gZmFsc2U7XG52YXIgY3VycmVudFF1ZXVlO1xudmFyIHF1ZXVlSW5kZXggPSAtMTtcblxuZnVuY3Rpb24gY2xlYW5VcE5leHRUaWNrKCkge1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgaWYgKGN1cnJlbnRRdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgcXVldWUgPSBjdXJyZW50UXVldWUuY29uY2F0KHF1ZXVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBxdWV1ZUluZGV4ID0gLTE7XG4gICAgfVxuICAgIGlmIChxdWV1ZS5sZW5ndGgpIHtcbiAgICAgICAgZHJhaW5RdWV1ZSgpO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gZHJhaW5RdWV1ZSgpIHtcbiAgICBpZiAoZHJhaW5pbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQoY2xlYW5VcE5leHRUaWNrKTtcbiAgICBkcmFpbmluZyA9IHRydWU7XG5cbiAgICB2YXIgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIHdoaWxlKGxlbikge1xuICAgICAgICBjdXJyZW50UXVldWUgPSBxdWV1ZTtcbiAgICAgICAgcXVldWUgPSBbXTtcbiAgICAgICAgd2hpbGUgKCsrcXVldWVJbmRleCA8IGxlbikge1xuICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKCFkcmFpbmluZykge1xuICAgICAgICBzZXRUaW1lb3V0KGRyYWluUXVldWUsIDApO1xuICAgIH1cbn07XG5cbi8vIHY4IGxpa2VzIHByZWRpY3RpYmxlIG9iamVjdHNcbmZ1bmN0aW9uIEl0ZW0oZnVuLCBhcnJheSkge1xuICAgIHRoaXMuZnVuID0gZnVuO1xuICAgIHRoaXMuYXJyYXkgPSBhcnJheTtcbn1cbkl0ZW0ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmZ1bi5hcHBseShudWxsLCB0aGlzLmFycmF5KTtcbn07XG5wcm9jZXNzLnRpdGxlID0gJ2Jyb3dzZXInO1xucHJvY2Vzcy5icm93c2VyID0gdHJ1ZTtcbnByb2Nlc3MuZW52ID0ge307XG5wcm9jZXNzLmFyZ3YgPSBbXTtcbnByb2Nlc3MudmVyc2lvbiA9ICcnOyAvLyBlbXB0eSBzdHJpbmcgdG8gYXZvaWQgcmVnZXhwIGlzc3Vlc1xucHJvY2Vzcy52ZXJzaW9ucyA9IHt9O1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcblxuLy8gVE9ETyhzaHR5bG1hbilcbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsInZhciBmcyA9IHJlcXVpcmUoJ2ZzJylcbiAgLCBsc3RhdCA9IGZzLmxzdGF0U3luYztcblxuZXhwb3J0cy5yZWFkbGlua1N5bmMgPSBmdW5jdGlvbiAocCkge1xuICBpZiAobHN0YXQocCkuaXNTeW1ib2xpY0xpbmsoKSkge1xuICAgIHJldHVybiBmcy5yZWFkbGlua1N5bmMocCk7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHA7XG4gIH1cbn07XG5cblxuIl19
