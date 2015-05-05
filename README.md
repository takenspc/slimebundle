# slimebundle

A tiny script that downloads same origin resources of the given web page using [SlimerJS](http://www.slimerjs.org).

## Features

- Download same origin resources (images, stylesheets, scripts and so on) of the page
- Capture screenshot of the page
- Print information of error resources (ex. 404) of the page

## Usage

```
slimerjs slimebundle.js -u http://slimerjs.org/
```

If you run the above commend, the resources will be downloaded at `./slimerjs.org/`.

## Options

```
slimerjs slimebundle.js \
    -u http://slimerjs.org/ \
    -i 1024 \
    -e 768 \
    -t 1000 \
    -s \
    -c image/png,image/gif \
    --skip-error-resources \
    --skip-screenshot
```

\-u or --url <string>
:   The URL of the page.

\-i or --width <n>
:   The width of the viewport.

\-e or --height <n>
:   The height of the viewport.

\-t, --timeout <n>
:   The timeout (ms). The default is 5000.

\-s, --skip-overwrite
:   Specify if you want to avoid overwriting previously downloaded files.

\-c, --capture-content <regexp,regexp,..>
:   The comman separated regexps matching content types of resources for which you want to retrieve the content. The default is ".+". [See more details](http://docs.slimerjs.org/current/api/webpage.html#webpage-capturecontent).

\--skip-saving
:    Specify if you want to skip saving resources.

\--skip-error-resources
:    Specify if you want to skip logging error resources.

\--skip-screenshot
:    Specify if you want to skip capturing screenshot.
