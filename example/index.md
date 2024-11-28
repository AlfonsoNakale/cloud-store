# index file

<!DOCTYPE html><!--  This site was created in Webflow. https://webflow.com  --><!--  Last Published: Sun Nov 24 2024 15:16:19 GMT+0000 (Coordinated Universal Time)  -->
<html data-wf-page="673ef33f8b1cf1b863befb7a" data-wf-site="673ef33f8b1cf1b863befb31">
<head>
  <meta charset="utf-8">
  <title>Cloud-store</title>
  <meta content="width=device-width, initial-scale=1" name="viewport">
  <meta content="Webflow" name="generator">
  <link href="css/normalize.css" rel="stylesheet" type="text/css">
  <link href="css/webflow.css" rel="stylesheet" type="text/css">
  <link href="css/cloud-store-comp.webflow.css" rel="stylesheet" type="text/css">
  <script type="text/javascript">!function(o,c){var n=c.documentElement,t=" w-mod-";n.className+=t+"js",("ontouchstart"in o||o.DocumentTouch&&c instanceof DocumentTouch)&&(n.className+=t+"touch")}(window,document);</script>
  <link href="images/favicon.ico" rel="shortcut icon" type="image/x-icon">
  <link href="images/webclip.png" rel="apple-touch-icon">
  <style>
.file-item {
  border: 1px solid #ddd;
  padding: 10px;
  margin: 10px 0;
  border-radius: 4px;
}
.file-item a {
  color: #0066cc;
  text-decoration: none;
}
.file-item a:hover {
  text-decoration: underline;
}
</style>
</head>
<body>
  <section class="section">
    <div class="file-form-holder">
      <div class="file-form-block w-form">
        <form id="wf-form-muiltiFileUploader" name="wf-form-muiltiFileUploader" data-name="muiltiFileUploader" method="get" class="file-form" data-wf-page-id="673ef33f8b1cf1b863befb7a" data-wf-element-id="5617610e-0d5e-efd7-db94-790766a6076b">
          <div class="input-container">
            <div class="input-element w-embed"><input id="file-input" type="file" class="input-element"></div>
            <div class="div-block-3">
              <div id="s-emptyState" class="icon-embed-xsmall-2 w-embed"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--tabler" width="100%" height="100%" preserveaspectratio="xMidYMid meet" viewbox="0 0 24 24">
                  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                    <path d="M19 11V9a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"></path>
                    <path d="m13 13l9 3l-4 2l-2 4zM3 3v.01M7 3v.01M11 3v.01M15 3v.01M3 7v.01M3 11v.01M3 15v.01"></path>
                  </g>
                </svg></div>
              <div id="s-fullState" class="icon-embed-xsmall-2 is-stop w-embed"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--tabler" width="100%" height="100%" preserveaspectratio="xMidYMid meet" viewbox="0 0 24 24">
                  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">
                    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12m0-6.5v-2a1.5 1.5 0 1 1 3 0V12m0-6.5a1.5 1.5 0 0 1 3 0V12"></path>
                    <path d="M17 7.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2h.208a6 6 0 0 1-5.012-2.7A69.74 69.74 0 0 1 7 19c-.312-.479-1.407-2.388-3.286-5.728a1.5 1.5 0 0 1 .536-2.022a1.867 1.867 0 0 1 2.28.28L8 13"></path>
                  </g>
                </svg></div>
            </div>
            <div id="s-uploadLoader" class="div-block-4">
              <p class="paragraph">Uploading</p>
              <div class="html-loader is-button is-small w-embed"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewbox="0 0 24 24">
                  <path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"></path>
                  <path fill="currentColor" d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"></path>
                    <animatetransform attributename="transform" dur="0.75s" repeatcount="indefinite" type="rotate" values="0 12 12;360 12 12">
                </animatetransform></svg></div>
            </div>
          </div>
          <div id="a-fileList" class="image-list-holder">
            <div id="a-fileItem" class="file-item">
              <p id="a-fileName" class="paragraph w-node-_5c416cf2-d2bb-2b10-dbc0-ef8e5d283597-63befb7a">-</p>
              <div id="w-node-d2d1b2d0-4628-9cf5-d66a-70dd23f9f072-63befb7a" class="div-block-2">
                <div id="s-removeFileLoader" class="html-loader is-button w-embed"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewbox="0 0 24 24">
                    <path fill="currentColor" d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"></path>
                    <path fill="currentColor" d="M10.72,19.9a8,8,0,0,1-6.5-9.79A7.77,7.77,0,0,1,10.4,4.16a8,8,0,0,1,9.49,6.52A1.54,1.54,0,0,0,21.38,12h.13a1.37,1.37,0,0,0,1.38-1.54,11,11,0,1,0-12.7,12.39A1.54,1.54,0,0,0,12,21.34h0A1.47,1.47,0,0,0,10.72,19.9Z"></path>
                      <animatetransform attributename="transform" dur="0.75s" repeatcount="indefinite" type="rotate" values="0 12 12;360 12 12">
                  </animatetransform></svg></div>
                <div id="s-removeFile" class="icon-embed-xsmall w-embed"><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--iconoir" width="100%" height="100%" preserveaspectratio="xMidYMid meet" viewbox="0 0 24 24">
                    <path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 14.828L12.001 12m2.828-2.828L12.001 12m0 0L9.172 9.172M12.001 12l2.828 2.828M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2S2 6.477 2 12s4.477 10 10 10"></path>
                  </svg></div>
              </div>
            </div>
            <div id="s-emptyPlaceholder" class="empty-placeholder is-hidden">
              <p id="w-node-_6d702701-16f3-403b-f76e-12a187cf559a-63befb7a" class="paragraph centre-aligned">There are no files uploaded yet...</p>
            </div>
          </div>
          <div id="s-maxError" class="paragraph centre-aligned error">-</div>
          <div id="uploadFile" class="submit-button">
            <div>Upload Files</div>
          </div>
          <a href="files.html" class="submit-button secondary w-button">View Uploaded Files</a>
        </form>
        <div class="w-form-done">
          <div>Thank you! Your submission has been received!</div>
        </div>
        <div class="w-form-fail">
          <div>Oops! Something went wrong while submitting the form.</div>
        </div>
      </div>
    </div>
  </section>
  <script src="https://d3e54v103j8qbb.cloudfront.net/js/jquery-3.5.1.min.dc5e7f18c8.js?site=673ef33f8b1cf1b863befb31" type="text/javascript" integrity="sha256-9/aliU8dGd2tb6OSsuzixeV4y/faTqgFtohetphbbj0=" crossorigin="anonymous"></script>
  <script src="js/webflow.js" type="text/javascript"></script>
  <script type="module" src="http://localhost:3000/@vite/client"></script>
  <script type="module" src="http://localhost:3000/src/main.js"></script>
</body>
</html>
