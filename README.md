
# Fuzzyface

Fuzzyface is a file handler application built with Svelte/Sveltekit. It provides functionality for uploading, downloading, and managing files using Cloudflare R2 and AWS S3.
Features

- Upload files using presigned URLs obtained from the Cloudflare R2 API.
- Set the content type and add metadata to uploaded files using headers.
- Support for extended metadata using Unicode headers.
- Properly configure CORS settings in the Cloudflare R2 Dashboard to allow headers.
Installation

To install and run Fuzzyface locally, follow these steps:

1. Clone the repository.
2. Install the dependencies by running yarn install.
3. Configure the Cloudflare R2 settings in the wrangler.toml.example file.
4. Rename the wrangler.toml.example file to wrangler.toml.
5. Start the development server by running yarn dev.
Usage

Once the development server is running, you can access the Fuzzyface application in your browser. The application provides a user interface for uploading, downloading, and managing files.
Contributing

Contributions to Fuzzyface are welcome! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.
License

Fuzzyface is free to use. This Readme was generated with GPT3/Cursor. DM me on Twitter @yawnxyz.



## Notes on Presigned URLs and Cloudflare

- Once you get a presigned URL from the other POST endpoint; the URL expires in 1hr. Presigned URLs can be used by cURL, restfox, or frontend. More details here: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/ 
- Note the use of Content-Type to set the proper content type of the uploaded file, and using "x-amz-meta-testfield" to add metadata
- Other headers are supported: https://developers.cloudflare.com/r2/api/s3/extensions/#extended-metadata-using-unicode 
- Also note that CORS need to be properly set within Cloudflare R2 Dashboard to allow Headers