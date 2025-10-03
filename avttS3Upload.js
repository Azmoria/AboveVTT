
const AVTT_S3 = 'https://l0cqoq0b4d.execute-api.us-east-1.amazonaws.com/default/uploader';
let S3_Current_Size = 0;
let currentFolder = "";
const userLimit = Object.freeze({
    low: 10 * 1024 * 1024 * 1024,
    mid: 25 * 1024 * 1024 * 1024,
    high: 100 * 1024 * 1024 * 1024
});
const allowedImageTypes = ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'webp'];
const allowedVideoTypes = ['mp4', 'mov', 'avi', 'mkv', 'wmv', 'flv', 'webm'];
const allowedAudioTypes = ['mp3', 'wav', 'aac', 'flac', 'ogg'];
const allowedJsonTypes = ['json', 'uvtt', 'dd2vtt', 'df2vtt'];
const allowedDocTypes = ['pdf'];

function launchFilePicker(){
   
    currentFolder = "";
    const filePicker = $(` <div id="avtt-file-picker">
      
        <div id="select-section">
            <div id='sizeUsed'><span id='user-used'></span> used of <span id='user-limit'> </span></div>
            <label style='color: var(--highlight-color, rgba(131, 185, 255, 1))' for="file-input">Upload File</label>
            <input style='display:none;' type="file" multiple id="file-input" accept="image/*,video/*,audio/*,.uvtt,.json,.dd2vtt,.df2vtt,application/pdf" />
       
            <div id='create-folder' style='color: var(--highlight-color, rgba(131, 185, 255, 1))'>Create Folder</div>
            <input id='create-folder-input' type='text' placeholder='folder name'/>
            <div id='upFolder' style='position: absolute; left: 30px; top:0px; text-align: left; cursor: pointer; var(--highlight-color, rgba(131, 185, 255, 1))'>Back (breadcrumb placeholder)</div>
            <div id='uploading-file-indicator' style='display:none'></div>
   
        </div>

        <div id="file-listing-section">
            <table id="file-listing"> 
                <tr><td>Loading...<td></tr>
            </table>
        </div>

        <div id="avtt-select-controls" style="text-align:center; margin-top:10px;">
            <button id="delete-selected-files" style="background: var(--background-color, #fff); color: var(--font-color, #000); border: 1px solid gray; border-radius:5px; padding:5px; margin-right:10px;">Delete</button>
            <button id="copy-path-to-clipboard" style="background: var(--background-color, #fff); color: var(--font-color, #000); border: 1px solid gray; border-radius:5px; padding:5px; margin-right:10px;">Copy Path</button>
            <button id="select-file" style="background: var(--background-color, #fff); color: var(--font-color, #000); border: 1px solid gray; border-radius:5px; padding:5px; margin-left:10px;">Select</button>    
        </div>
         </div>
    <style>   
        #avtt-file-picker {
            background: var(--background-color, #fff);
            color: var(--font-color, #000);
            border-radius: 5px;
            top: -1px;
            position: relative;
            padding: 10px;
            height: calc(100% - 25px);
            overflow: scroll;
        }
        #file-listing-section {
            text-align: left;
            margin: 20px;
            border: 1px solid gray;
            padding: 10px;
            list-style: none;
            padding: 0px;
            height: calc(100% - 151px);
            overflow-y: auto;
        }
        #file-listing-section tr{
            padding: 3px 5px;
        }
        #file-listing-section tr input{
            margin-right: 10px;
        }
        #file-listing-section tr label{
            flex-grow: 1;
            overflow: hidden;
            text-overflow: ellipsis;    
            white-space: nowrap;
            margin-bottom: 0px;
        }
        #select-section{
            text-align:right;
        }
        #file-listing-section tr:nth-of-type(odd) {
            backdrop-filter: brightness(0.7);
        }
    
    </style>
    
    
    `);
    const draggableWindow = find_or_create_generic_draggable_window("avtt-s3-uploader", "AVTT File Uploader", false, false, undefined, "800px", "600px", undefined, undefined, false, 'input, li, a, label');
    draggableWindow.append(filePicker);


    $('body').append(draggableWindow);


    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB limit
   


    const fileInput = document.getElementById('file-input');
    const createFolder = document.getElementById('create-folder');
    
    const deleteSelectedButton = document.getElementById('delete-selected-files');
    const copyPathButton = document.getElementById('copy-path-to-clipboard');
    
    

    
    let selectedFile = null;
        

    refreshFiles(currentFolder, true);

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files && event.target.files[0];
        if (!file) {
            return;
        }


        let totalSize = 0;
        
        const uploadingIndicator = document.getElementById('uploading-file-indicator');
        for (let i=0; i<event.target.files.length; i++){
            try {
                const selectedFile = event.target.files[i];

               
                const newHtml = `Uploading File<span id='file-number'>${i + 1}</span> of <span id='total-files'>${event.target.files.length}</span>`
                uploadingIndicator.innerHTML = newHtml;
                uploadingIndicator.style.display = 'block';
                const extension = getFileExtension(selectedFile.name);
                if (!isAllowedExtension(extension)) {
                    alert('Unsupported file type. Please select an image, video, audio, or supported UVTT/JSON file.');
                    return;
                }
                if (selectedFile.size > MAX_FILE_SIZE) {
                    alert('File is too large - 50MB maximum.');
                    return;
                }
                totalSize+= selectedFile.size;
                if (userLimit != undefined && totalSize + S3_Current_Size > userLimit.low ){
                    alert('User limit reached. Delete some files before uploading more.');
                    return;
                }
                const presignResponse = await fetch(`${AVTT_S3}?filename=${encodeURIComponent(`${currentFolder}${selectedFile.name}`)}&user=${window.CAMPAIGN_INFO.dmId}&upload=true`);
                if (!presignResponse.ok) {
                    throw new Error('Failed to retrieve upload URL.');
                }

                const data = await presignResponse.json();
                const uploadHeaders = {};
                const inferredType = resolveContentType(selectedFile);
                if (inferredType) {
                    uploadHeaders['Content-Type'] = inferredType;
                }

                const uploadResponse = await fetch(data.uploadURL, {
                    method: 'PUT',
                    body: selectedFile,
                    headers: uploadHeaders,
                });

                if (!uploadResponse.ok) {
                    throw new Error('Upload failed.');
                }

                uploadURL = data.uploadURL.split('?')[0];

            } catch (error) {
                console.error(error);
                alert(error.message || 'An unexpected error occurred while uploading.');
            }
            refreshFiles(currentFolder, true);
        }
        uploadingIndicator.innerHTML = 'Upload Complete';
        setTimeout(function(){
            uploadingIndicator.style.display = 'none'
        }, 2000)
     
        
    });

    createFolder.addEventListener('click', async (event) => {
        const folderName = $('#create-folder-input').val();
        try {
            await fetch(`${AVTT_S3}?folderName=${encodeURIComponent(`${currentFolder}${folderName}`)}&user=${window.CAMPAIGN_INFO.dmId}`);
            refreshFiles(currentFolder);
        }
        catch{  
            alert('Failed to create folder');
        }   
    })

    copyPathButton.addEventListener('click', () => {
        const selectedCheckboxes = $('#file-listing input[type="checkbox"]:checked');
       
        if (selectedCheckboxes.length == 0) {
            return;
        }
        const paths = [];
        for (const selected of selectedCheckboxes){
            paths.push(`above-bucket-not-a-url/${selected.value}`);
        }
        const copyText = paths.join(', ')
        navigator.clipboard.writeText(copyText);
    });

    deleteSelectedButton.addEventListener('click', async () => {
        const selectedCheckboxes = $('#file-listing input[type="checkbox"]:checked');
        if(selectedCheckboxes.length === 0) {
            return;
        }
        const commaDelimitedPaths = selectedCheckboxes.map(function() {
            return this.value;
        }).get().join(',');
        deleteFilesFromS3Folder(commaDelimitedPaths);
    });



    function isAllowedExtension(extension) {
        return allowedImageTypes.includes(extension)
            || allowedVideoTypes.includes(extension)
            || allowedAudioTypes.includes(extension)
            || allowedJsonTypes.includes(extension)
            || allowedDocTypes.includes(extension);
    }

    function resolveContentType(file) {
        if (file.type) {
            return file.type;
        }

        const extension = getFileExtension(file.name);
        if (allowedJsonTypes.includes(extension)) {
            return 'application/json';
        }
        if (allowedImageTypes.includes(extension)) {
            return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
        }
        if (allowedVideoTypes.includes(extension)) {
            return `video/${extension}`;
        }
        if (allowedAudioTypes.includes(extension)) {
            return `audio/${extension}`;
        }
        if (allowedDocTypes.includes(extension)) {
            return `application/pdf`
        }
        return '';
    }

    

}

function getFileExtension(name) {
    const parts = name.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = bytes / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function refreshFiles(path, recheckSize = false) {
    if (recheckSize) {
        getUserUploadedFileSize().then(size => {
            S3_Current_Size = size;
            document.getElementById('user-used').innerHTML = formatFileSize(S3_Current_Size);
            document.getElementById('user-limit').innerHTML = formatFileSize(userLimit.low);
        });
    }
    const fileListing = document.getElementById('file-listing');
    const upFolder = $('#upFolder');
    if(path != "")
        upFolder.show();
    else 
        upFolder.hide();

    upFolder.off('click.upFolder').on('click.upFolder', function(e){
        e.preventDefault();
        if (path.match(/(.*)\/.*\/$/gi)){
            const newPath = path.replace(/(.*\/).*\/$/gi, '$1');
            refreshFiles(newPath);
            currentFolder = newPath;
        }
        else{
            refreshFiles("");
            currentFolder = "";
        }

    })

    getFolderListingFromS3(path).then(files => {
 
        console.log("Files in folder: ", files);
        if (files.length === 0) {
            fileListing.innerHTML = '<tr><td>No files found.</td></tr>';
        }
        else {
            fileListing.innerHTML = '';
            for (const filePath of files) {
                const listItem = document.createElement('tr');
                const regEx = new RegExp(`^${window.CAMPAIGN_INFO.dmId}/`, "gi");
                const path = filePath.replace(regEx, '');
                const isFolder = path.match(/\/$/gi);
                const input = $(`<td><input type="checkbox" id='input-${path}' class="avtt-file-checkbox ${isFolder ? 'folder' : ''}" value="${path}"></td>`);
                const label = $(`<td><label for='input-${path}' style="cursor:pointer;" class="avtt-file-name  ${isFolder ? 'folder' : '' }" title="${path}">${path}</label></td>`);

                const extension = getFileExtension(filePath);
                let type = '';
                if(isFolder){
                    type = 'FOLDER';
                }
                else if (allowedJsonTypes.includes(extension)) {
                    type = 'UVTT';
                }
                else if (allowedImageTypes.includes(extension)) {
                    type = 'IMAGE';
                }
                else if (allowedVideoTypes.includes(extension)) {
                    type = 'VIDEO'
                }
                else if (allowedAudioTypes.includes(extension)) {
                    type = 'AUDIO'
                }
                if (allowedDocTypes.includes(extension)) {
                    type = 'PDF'
                }
                const typeCell = $(`<td>${type}</td>`);
                
                $(listItem).append(input, label, typeCell);
                if (isFolder){
                    label.off('click.openFolder').on('click.openFolder', function(e){
                        e.preventDefault();
                        refreshFiles(path);
                        currentFolder = path;
                    })
                }
                fileListing.appendChild(listItem);
            }
        }
    }).catch(err => {
        alert("Error fetching folder listing. See console for details.");
        console.error("Error fetching folder listing: ", err);
    });


}

async function deleteFilesFromS3Folder(fileKeys) {
    const url = await fetch(`${AVTT_S3}?user=${window.CAMPAIGN_INFO.dmId}&filename=${fileKeys}&deleteFiles=true`);
    const json = await url.json();
    const deleted = json.deleted;
    if (!deleted) {
        throw new Error("Failed to delete file(s)");
    }
    refreshFiles(currentFolder, true);
}

async function getFileFromS3(fileName){

    const url = await fetch(`${AVTT_S3}?user=${window.CAMPAIGN_INFO.dmId}&filename=${fileName}`);
    const json = await url.json();
    const fileURL = json.downloadURL;
    if(!fileURL){
        throw new Error("File not found on S3");
    }
    console.log("File found on S3: ", fileURL);
    return fileURL;
}

async function getFolderListingFromS3(folderPath) {
    const url = await fetch(`${AVTT_S3}?user=${window.CAMPAIGN_INFO.dmId}&filename=${encodeURIComponent(folderPath)}&list=true`);
    const json = await url.json();
    const folderContents = json.folderContents;
    let filePaths = [];
    for(const file of folderContents) {
        filePaths.push(file.Key);
    }
    return filePaths;
}

async function getUserUploadedFileSize(){
    const url = await fetch(`${AVTT_S3}?user=${window.CAMPAIGN_INFO.dmId}&filename=${encodeURIComponent('')}&list=true&includeSubDirFiles=true`);
    const json = await url.json();
    const folderContents = json.folderContents;
    let userSize = 0;
    for (const file of folderContents) {
        userSize += file.Size;
    }
    return userSize;
}