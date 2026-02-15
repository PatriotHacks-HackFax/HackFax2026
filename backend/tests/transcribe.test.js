const request = require('supertest');

jest.mock('../services/llmService', () => ({
  transcribeSymptomsFromAudio: jest.fn(),
  generateDiagnosis: jest.fn(),
}));

const llmService = require('../services/llmService');
const app = require('../app');

describe('POST /transcribe-audio', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects missing audio fields', async () => {
    await request(app).post('/transcribe-audio').send({}).expect(400);
    expect(llmService.transcribeSymptomsFromAudio).not.toHaveBeenCalled();
  });

  it('rejects invalid mime type', async () => {
    await request(app)
      .post('/transcribe-audio')
      .send({ audioData: 'abc', audioMimeType: 'text/plain' })
      .expect(400);
    expect(llmService.transcribeSymptomsFromAudio).not.toHaveBeenCalled();
  });

  it('returns transcription and language', async () => {
    llmService.transcribeSymptomsFromAudio.mockResolvedValue({
      symptomsText: 'dolor de cabeza y fiebre',
      languageCode: 'es',
    });

    const res = await request(app)
      .post('/transcribe-audio')
      .send({ audioData: 'abc123', audioMimeType: 'audio/webm' })
      .expect(200);

    expect(res.body).toEqual({
      symptomsText: 'dolor de cabeza y fiebre',
      languageCode: 'es',
    });
  });

  it('accepts audio MIME types with codec parameters', async () => {
    llmService.transcribeSymptomsFromAudio.mockResolvedValue({
      symptomsText: 'headache and dizziness',
      languageCode: 'en',
    });

    const res = await request(app)
      .post('/transcribe-audio')
      .send({ audioData: 'abc123', audioMimeType: 'audio/webm;codecs=opus' })
      .expect(200);

    expect(res.body.languageCode).toBe('en');
  });
});
