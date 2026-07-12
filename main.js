import { Camera } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';

let currentDataUrl = null;
const preview = document.getElementById('preview');
const pickBtn = document.getElementById('pickBtn');
const processBtn = document.getElementById('processBtn');
const saveBtn = document.getElementById('saveBtn');
const shareBtn = document.getElementById('shareBtn');

pickBtn.onclick = async () => {
  try {
    const photo = await Camera.getPhoto({ quality: 95, resultType: 'dataUrl', source: 'PHOTOS' });
    currentDataUrl = photo.dataUrl;
    preview.src = currentDataUrl;
    processBtn.disabled = false;
  } catch(e) {}
};

processBtn.onclick = () => {
  if (!currentDataUrl) return;
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const s = Math.min(img.width, img.height);
    canvas.width = s; canvas.height = s;
    ctx.drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, s, s);
    currentDataUrl = canvas.toDataURL('image/png', 1.0);
    preview.src = currentDataUrl;
    saveBtn.disabled = false;
    shareBtn.disabled = false;
  };
  img.src = currentDataUrl;
};

saveBtn.onclick = async () => {
  if (!currentDataUrl) return;
  const base64 = currentDataUrl.split(',')[1];
  const fileName = `pixel-pic-${Date.now()}.png`;
  try {
    await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Documents });
    alert('Saved to Documents!');
  } catch(e) { alert('Save failed'); }
};

shareBtn.onclick = async () => {
  try {
    await Share.share({ title: 'Pixel-Pic', text: 'My new profile pic!', url: currentDataUrl });
  } catch(e) {}
};
