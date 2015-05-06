# slimebundle

A tiny script that downloads same origin resources of the given web page using [SlimerJS](http://www.slimerjs.org).

## Features

- Download same origin resources (images, style sheets, scripts and so on) of the page
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

<dl>
<dt>-u or --url &lt;string&gt;</dt>
<dd>The URL of the page.</dd>
<dt>-i or --width &lt;n&gt;</dt>
<dd>The width of the viewport.</dd>
<dt>-e or --height &lt;n&gt;</dt>
<dd>The height of the viewport.</dd>
<dt>-t or --timeout &lt;n&gt;</dt>
<dd>The timeout (ms). The default is 5000.</dd>
<dt>-s or --skip-overwrite</dt>
<dd>Specify if you want to avoid overwriting previously downloaded files.</dd>
<dt>-c or --capture-content &lt;regexp,regexp,..&gt;</dt>
<dd>The comma separated regexps matching content types of resources for which you want to retrieve the content. The default is &quot;.+&quot;. <a href="http://docs.slimerjs.org/current/api/webpage.html#webpage-capturecontent">See more details</a>.
</dd>
<dt>--skip-saving</dt>
<dd>Specify if you want to skip saving resources.</dd>
<dt>--skip-error-resources</dt>
<dd>Specify if you want to skip logging error resources.</dd>
<dt>--skip-screenshot</dt>
<dd>Specify if you want to skip capturing screenshot.</dd>
</dl>
