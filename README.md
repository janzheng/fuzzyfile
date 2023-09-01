
# Fuzzyfile

Fuzzyfile is a simple blob storage file handler built on top of Cloudflare Workers and Cloudflare R2 object storage.

## Features

- Key/Scope paths: generates a new "scope" path for uploaded documents, along the lines of: `/{scope?}/{nanoid:“#123abc”}/{version? “v2”}/filename.jpeg`
- Documents uploaded to the same scope and "nanoid" path will be versioned
- Can get the latest uploaded file using the same scope and nanoid, or previous versions with /v1, /v2 appended to the URL etc.
- Upload files using presigned URLs obtained from the Cloudflare R2 API. (this doesn't support autoscoping yet)
- Set the content type and add metadata to uploaded files using headers.
- Support for extended metadata using Unicode headers.
- Properly configure CORS settings in the Cloudflare R2 Dashboard to allow headers.


### Dev & Usage

Fuzzyfile is meant to support small Sveltekit projects. Once the development server is running, or deployed on Coudflare Workers, you can access the Fuzzyfile application in your browser. The application provides a user interface for uploading, downloading, and managing files.

### Using with Restfox or REST 

#### **Get files / List files**

1. global file access: 
    1. direct download: `f2.phage.directory`/`filename.jpg`
    2. ~~scoping: `f2.phage.directory`/`yawnxyz`/`filename.jpg`~~
    3. ~~versioning: `f2.phage.directory`/`yawnxyz`/`v2`/`filename.jpg`~~
    4. gets any R2 bucket url: `f2.phage.directory` / `yawnxyz` / `filename.jpg`
2. nanoid + scoping 
    1. ~~file access: `f2.phage.directory`/`#123abc`~~
    2. ~~file access w/ coerced file names: `f2.phage.directory`/`#123abc`/`filename.jpg`~~
    3. scoping + nanoid: `f2.phage.directory`/`yawnxyz`/`123abc`
    4. scoping + nanoid + optional file name `f2.phage.directory`/`yawnxyz`/`123abc`/`filename.jpg`
        - note that “filename.jpg” can be anything — helps apps like Mailchimp download the file
    5. scoping + nanoid + optional file name + versions: `f2.phage.directory`/`yawnxyz`/`123abc`/`v2`
3. download zip file of folder(s)
    1. `f2.phage.directory` / `download` / `arbitrary/path/here`


### **Add files**

1. direct file: `f2.phage.directory` / `?url=https://url/filename.jpg` `&name=newfilename.jpg`
    - overwrites any file at that file name, by design, and returns the file config object
    - the file can directly be accessed at `f2.phage.directory` / `?url=https://url/filename.jpg` — the big difference is that using `url` returns the actual file.
        - These should not create new nanoids
        - This makes it easy to “divert” images through the cache. Also supports scoping: `f2.phage.directory` / `yawnxyz`/ `?url=https://url/filename.jpg`
        - ex: https://filofax.yawnxyz.workers.dev/yawnxyz?url=https://images.squarespace-cdn.com/content/v1/587d6250d482e9eee8c47666/1540424634143-VRRF0DZYLBJEH165RDRQ/1D3B6477.jpg?format=1500w
2. nanoid + scoping:
    1. new file, creates a new id: `f2.phage.directory` / `yawnxyz`/ `?add=https://url/filename.jpg` `&name=newfilename.jpg`
    2. ~~new file, creates a new id; returns image: `f2.phage.directory` / `yawnxyz`/ `?url=https://url/filename.jpg`~~
        - using ?url should set a “direct upload” instead and NOT create a new id
    3. new version, using existing id: `f2.phage.directory` / `yawnxyz` / `123abc` / `?add=https://url/filename.jpg` `&name=newfilename.jpg`
    4. ~~new file, returning image (use ?url): `f2.phage.directory` / `yawnxyz`/ `123abc` / `?url=https://url/filename.jpg` `&name=newfilename.jpg`~~
    5. POST to `f2.phage.directory` / `yawnxyz` with an object, returns:
        - POSTing should allow for arbitrary folder/file paths
    
    ```markdown
    {
    	nanoid: 123abc,
    	url: https://url/filename.jpg,
      key: newfilename.jpg
    }
    ```


#### **List files**

1. scope lists all files, grouped by nanoid:
    1. same as above: `f2.phage.directory` / `list` / `yawnxyz` / `arbitrary/path`
    2. lists all versions within an id: `f2.phage.directory` / `list` / `yawnxyz` / `123abc`
    3. will also work: `f2.phage.directory` /`yawnxyz` / `123abc` / `list`


#### CLI Tips & Tricks

1. Use `wget` to download a directory of files as a zip file, with the `download` url directory “flag”. Use `-O filename.zip` to rename it properly:
    
    ```markdown
    wget http://localhost:8787/download/yawnxyz/profiles -O profiles.zip
    ```
    
2. BUG: Use `wget` or `curl` to download individual files: (curl requires file names for output)
    
    ```markdown
    wget --content-disposition http://localhost:8787/yawnxyz/profiles/Ed-6EMTo
    wget http://localhost:8787/yawnxyz/profiles/Ed-6EMTo -O image.jpg
    curl http://localhost:8787/yawnxyz/profiles/Ed-6EMTo --output image.jpg
    ```
    
3. Use `curl` and `form-data` to upload one or multiple files. Set a scope for the files to later be downloadable as a zip file
    
    ```markdown
    curl http://localhost:8787/ \
       -F "scope=yawnxyz/upload-test" \
       -F "files[]=@piedpiper.jpg" \
       -F "files[]=@image.jpg" \
       -F "files[]=@profiles.zip"
    
    >>> or to add an entire folder's files:
    find . -type f -print0 | xargs -0 -I {} curl -F "files=@\"{}\"" -F "scope=yawnxyz/multi-test" http://localhost:8787/
    
    >>> or to add an entire folder and subfolders:
    >>>>>> the "filepath" argument lets you insert deep folders for each file, e.g. to preserve file/folder paths
    
    find . -type f -print0 -exec printf '%s\0' {} \; | xargs -0 -I {} curl -F "files=@\"{}\"" -F "scope=yawnxyz/my-files" -F "filePath=\"{}\"" http://localhost:8787/
    
    >>> then download the entire folder:
    wget --content-disposition http://localhost:8787/download/yawnxyz/my-files -O myfiles.zip
    ```

#### Using with bash
These are for me, because I keep forgetting I can do this kind of stuff
- `./myscript.sh`
- to run it: `chmod +x [myscript.sh](http://myscript.sh/)` then type `myscript.sh` and enter

```bash
#!/bin/bash

# Create the zip file
zip -r archive.zip .

# Send the zip file to the endpoint as a POST form file upload
curl -X POST -F "file=@archive.zip" https://example.com

# Remove the zip file after uploading
rm archive.zip
```



### Ideas + Features
  - unique file nanoid refs to prevent collisions
  - should we get a list of arrays based on the nanoids (instead of just objects) and the versions within each nanoid?
  - should we add ipfs hash as metadata to check for duplicates, versioning, etc?
  - file versioning of nanoid refs
      - a way to retrieve older nanoid, version, and username/scope
      - should use ipfs file hash to figure out identity — if the file is NOT identical to any file, upload it and bump the versions; otherwise just return the version of the file that matches and say it exists
  - list all files of the same file names
  - private / passworded features:
      - lock lots of stuff under passwords
      - passworded downloads
      - passworded uploads
      - passworded file replace (as opposed to creating a new version)
  - scoped folders - username, keyword, etc.
  - file modes
      - nanoid folder mode
      - nanoid filename mode
      - direct mode (current; make non-default mode)
  - get list of files for each nanoid: file name, date, file size, version number

### Notes on Presigned URLs and Cloudflare

- Once you get a presigned URL from the other POST endpoint; the URL expires in 1hr. Presigned URLs can be used by cURL, restfox, or frontend. More details here: https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/ 
- Note the use of Content-Type to set the proper content type of the uploaded file, and using "x-amz-meta-testfield" to add metadata
- Other headers are supported: https://developers.cloudflare.com/r2/api/s3/extensions/#extended-metadata-using-unicode 
- Also note that CORS need to be properly set within Cloudflare R2 Dashboard to allow Headers




## Installation & Deployment

To install and run Fuzzyfile locally, follow these steps:

1. Clone the repository.
2. Install the dependencies by running yarn install. Make sure you have Wrangler or Miniflare set up
3. Configure the Cloudflare R2 settings in the wrangler.toml.example file.
4. Rename the wrangler.toml.example file to wrangler.toml.
5. Start the development server by running yarn dev.



## Contributing

Contributions to Fuzzyfile are welcome! This was written somewhat hastily and with the help of GPT-4 so probably has lots of bugs! If you find any issues or have suggestions for improvements, please open an issue or submit a pull request on the GitHub repository.
License

Fuzzyfile is free to use. This Readme was generated with GPT3/Cursor. DM me on Twitter @yawnxyz.
