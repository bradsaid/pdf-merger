const fileInput = document.querySelector('#file-input');
const dropArea = document.querySelector('#drop-area');
const fileList = document.querySelector('#file-list');
const errorMsg = document.querySelector('#error');
let files = [];

// File input handler
fileInput.addEventListener('change', (e) => {
  handleFiles(e.target.files);
});

// Drag-and-drop handlers
dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('dragover');
});
dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('dragover');
});
dropArea.addEventListener('drop', (e) => {
  e.preventDefault();
  dropArea.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
dropArea.addEventListener('click', () => fileInput.click());

function handleFiles(newFiles) {
    const acceptedFiles = Array.from(newFiles).filter(file =>
        file.type === 'application/pdf' || file.type.startsWith('image/')
    );

    if (acceptedFiles.length === 0) {
        showError('Please upload valid PDF or image files.');
        return;
    }

    files = [...files, ...acceptedFiles];

    if (files.length > 20) {
        files = files.slice(0, 20);
        showError('Maximum 20 files allowed.');
    }

    updateFileList();
}

function updateFileList() {
    dropArea.innerHTML = '';

    files.forEach((file, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.draggable = true;
        item.dataset.index = index;

        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        item.appendChild(spinner);

        const name = document.createElement('div');
        name.textContent = file.name;
        item.appendChild(name);

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.onclick = () => removeFile(index);
        item.appendChild(removeBtn);

        // Drag and drop handlers
        item.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        });
        item.addEventListener('dragover', (e) => e.preventDefault());
        item.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = e.dataTransfer.getData('text/plain');
        reorderFiles(fromIndex, index);
        });

        dropArea.appendChild(item);

        // Render preview based on file type
        if (file.type === 'application/pdf') {
        const canvas = document.createElement('canvas');
        const reader = new FileReader();
        reader.onload = async function (e) {
            const typedarray = new Uint8Array(e.target.result);
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            const page = await pdf.getPage(1);
            const unscaledViewport = page.getViewport({ scale: 1 });
            const scale = 100 / unscaledViewport.width;
            const viewport = page.getViewport({ scale });

            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: ctx, viewport }).promise;

            // Replace spinner with canvas
            item.replaceChild(canvas, spinner); 
        };
        reader.readAsArrayBuffer(file);
        } else if (file.type.startsWith('image/')) {

            const canvas = document.createElement('canvas');
            const img = new Image();
            const reader = new FileReader();
            reader.onload = function (e) {
            img.onload = function () {
                canvas.width = 100;
                canvas.height = 130;

                const ctx = canvas.getContext('2d');
                const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                const x = (canvas.width - scaledWidth) / 2;
                const y = (canvas.height - scaledHeight) / 2;

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, x, y, scaledWidth, scaledHeight);

                // Replace spinner with canvas
                item.replaceChild(canvas, spinner);
                };
                img.src = e.target.result;
            };

        reader.readAsDataURL(file);
        }
    });
}


// Reorder files
function reorderFiles(fromIndex, toIndex) {
  const [movedFile] = files.splice(fromIndex, 1);
  files.splice(toIndex, 0, movedFile);
  updateFileList();
}

// Remove a file
function removeFile(index) {
  files.splice(index, 1);
  updateFileList();
}

// Show error message
function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  setTimeout(() => { errorMsg.style.display = 'none'; }, 3000);
}

// Merge and download PDFs
async function mergeAndDownload() {
  if (files.length < 2) {
    showError('Please upload at least 2 PDF files.');
    return;
  }
  try {
    const mergedPdf = await PDFLib.PDFDocument.create();
    for (const file of files) {
        const buffer = await file.arrayBuffer();

        if (file.type === 'application/pdf') {
            const pdf = await PDFLib.PDFDocument.load(buffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        } else if (file.type.startsWith('image/')) {
            const imgPdf = await PDFLib.PDFDocument.create();
            let img;
            if (file.type === 'image/jpeg') {
            img = await imgPdf.embedJpg(buffer);
            } else {
            img = await imgPdf.embedPng(buffer);
            }
            const pageWidth = 612;
            const pageHeight = 792;
            const page = imgPdf.addPage([pageWidth, pageHeight]);

            // Scale image proportionally to fit within page
            const scale = Math.min(pageWidth / img.width, pageHeight / img.height);
            const scaledWidth = img.width * scale;
            const scaledHeight = img.height * scale;

            // Center image on page
            const x = (pageWidth - scaledWidth) / 2;
            const y = (pageHeight - scaledHeight) / 2;

            page.drawImage(img, {
                x,
                y,
                width: scaledWidth,
                height: scaledHeight
            });
            const imgPdfBytes = await imgPdf.save();
            const imgDoc = await PDFLib.PDFDocument.load(imgPdfBytes);
            const copiedPages = await mergedPdf.copyPages(imgDoc, imgDoc.getPageIndices());
            copiedPages.forEach((page) => mergedPdf.addPage(page));
        }
    }
    const pdfBytes = await mergedPdf.save();
    downloadPDF(pdfBytes, 'merged.pdf');
  } catch (error) {
    showError('Error merging PDFs. Try smaller files.');
    console.error(error);
  }
}

// Download the merged PDF
function downloadPDF(pdfBytes, fileName) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}