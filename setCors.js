const { Storage } = require('@google-cloud/storage');

// Firebase 프로젝트 ID와 버킷 이름 설정
const projectId = 'veryusduet';
const bucketName = 'veryusduet.appspot.com';

// Storage 클라이언트 초기화
const storage = new Storage({
  projectId: projectId,
});

async function setCorsConfiguration() {
  try {
    const [bucket] = await storage.bucket(bucketName).get();

    const corsConfiguration = [
      {
        origin: ['*'],
        method: ['GET', 'POST', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
        responseHeader: [
          'Content-Type',
          'Access-Control-Allow-Origin',
          'Access-Control-Allow-Methods',
          'Access-Control-Allow-Headers',
          'Access-Control-Max-Age',
          'Origin',
          'X-Requested-With',
          'Content-Length',
          'Accept',
          'Authorization'
        ],
        maxAgeSeconds: 3600,
      },
    ];

    await bucket.setCorsConfiguration(corsConfiguration);
    console.log('CORS configuration has been updated.');
  } catch (error) {
    console.error('Error updating CORS configuration:', error);
  }
}

setCorsConfiguration(); 