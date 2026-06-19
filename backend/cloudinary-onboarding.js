#!/usr/bin/env node
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: 'don1wbiru',
  api_key: '869142445523231',
  api_secret: 'rOj9MM9wK4Kr0iEZHnOHU-dspM4',
  secure: true,
});

async function main() {
  const sampleImageUrl = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';

  console.log('Uploading sample image from Cloudinary demo domain...');
  const uploadResult = await cloudinary.uploader.upload(sampleImageUrl, {
    folder: 'choeback/onboarding',
    public_id: `sample-${Date.now()}`,
    resource_type: 'image',
  });

  console.log('Uploaded secure URL:', uploadResult.secure_url);
  console.log('Uploaded public ID:', uploadResult.public_id);

  const details = await cloudinary.api.resource(uploadResult.public_id, {
    resource_type: 'image',
  });

  console.log('Image width:', details.width);
  console.log('Image height:', details.height);
  console.log('Image format:', details.format);
  console.log('File size in bytes:', details.bytes);

  // f_auto: lets Cloudinary choose the best output format for the browser.
  // q_auto: lets Cloudinary choose an optimized quality level automatically.
  const optimizedUrl = cloudinary.url(uploadResult.public_id, {
    secure: true,
    transformation: [
      {
        fetch_format: 'auto',
        quality: 'auto',
      },
    ],
  });

  console.log('Done! Click link below to see optimized version of the image. Check the size and the format.');
  console.log('Optimized URL:', optimizedUrl);
}

main().catch((error) => {
  console.error('Cloudinary onboarding failed:', error);
  process.exit(1);
});
