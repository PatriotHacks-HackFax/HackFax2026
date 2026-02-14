const request = require('supertest');

jest.mock('../services/llmService', () => ({
  generateDiagnosis: jest.fn(),
}));

const llmService = require('../services/llmService');
const app = require('../app');

describe('POST /diagnose', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects when symptoms is missing', async () => {
    const res = await request(app).post('/diagnose').send({}).expect(400);
    expect(res.body.error).toBeDefined();
    expect(llmService.generateDiagnosis).not.toHaveBeenCalled();
  });

  it('accepts symptoms as free text', async () => {
    llmService.generateDiagnosis.mockResolvedValue({
      condition: 'tension headache',
      severity: 1,
      reasoning: 'Common pattern for stress.',
    });

    const res = await request(app).post('/diagnose').send({ symptoms: 'headache and stress' }).expect(200);
    expect(res.body.condition).toBe('tension headache');
    expect(llmService.generateDiagnosis).toHaveBeenCalledWith({
      symptoms: ['headache and stress'],
      image: null,
    });
  });

  it('rejects when symptoms is empty array', async () => {
    await request(app).post('/diagnose').send({ symptoms: [] }).expect(400);
    expect(llmService.generateDiagnosis).not.toHaveBeenCalled();
  });

  it('rejects when symptoms contains non-strings', async () => {
    await request(app).post('/diagnose').send({ symptoms: ['headache', 123] }).expect(400);
    expect(llmService.generateDiagnosis).not.toHaveBeenCalled();
  });

  it('rejects when symptoms is neither string nor array', async () => {
    await request(app).post('/diagnose').send({ symptoms: 42 }).expect(400);
    expect(llmService.generateDiagnosis).not.toHaveBeenCalled();
  });

  it('returns unsafe_input for self-harm related phrases', async () => {
    const res = await request(app)
      .post('/diagnose')
      .send({ symptoms: ['I want to self harm'] })
      .expect(400);
    expect(res.body.error).toBe('unsafe_input');
    expect(llmService.generateDiagnosis).not.toHaveBeenCalled();
  });

  it('returns JSON with condition, severity, reasoning when LLM succeeds', async () => {
    llmService.generateDiagnosis.mockResolvedValue({
      condition: 'tension headache',
      severity: 1,
      reasoning: 'Common pattern for stress.',
    });
    const res = await request(app)
      .post('/diagnose')
      .send({ symptoms: ['headache'] })
      .expect(200);
    expect(res.body).toEqual({
      condition: 'tension headache',
      severity: 1,
      reasoning: 'Common pattern for stress.',
    });
    expect(llmService.generateDiagnosis).toHaveBeenCalledWith({
      symptoms: ['headache'],
      image: null,
    });
  });

  it('returns severity as integer', async () => {
    llmService.generateDiagnosis.mockResolvedValue({
      condition: 'flu',
      severity: 2,
      reasoning: 'Moderate.',
    });
    const res = await request(app)
      .post('/diagnose')
      .send({ symptoms: ['fever', 'cough'] })
      .expect(200);
    expect(typeof res.body.severity).toBe('number');
    expect(Number.isInteger(res.body.severity)).toBe(true);
    expect(res.body.severity).toBe(2);
  });

  it('returns llm_failure when LLM throws', async () => {
    llmService.generateDiagnosis.mockRejectedValue(new Error('API error'));
    const res = await request(app)
      .post('/diagnose')
      .send({ symptoms: ['headache'] })
      .expect(503);
    expect(res.body.error).toBe('llm_failure');
  });

  it('passes optional image to the LLM service', async () => {
    llmService.generateDiagnosis.mockResolvedValue({
      condition: 'skin irritation',
      severity: 1,
      reasoning: 'Mild visual irritation.',
    });

    await request(app)
      .post('/diagnose')
      .send({
        symptoms: 'red patch on arm',
        imageMimeType: 'image/png',
        imageData: 'iVBORw0KGgoAAAANSUhEUg==',
      })
      .expect(200);

    expect(llmService.generateDiagnosis).toHaveBeenCalledWith({
      symptoms: ['red patch on arm'],
      image: {
        mimeType: 'image/png',
        data: 'iVBORw0KGgoAAAANSUhEUg==',
      },
    });
  });

  it('accepts image-only diagnosis requests', async () => {
    llmService.generateDiagnosis.mockResolvedValue({
      condition: 'possible rash',
      severity: 1,
      reasoning: 'Visual pattern appears mild.',
    });

    await request(app)
      .post('/diagnose')
      .send({
        imageMimeType: 'image/jpeg',
        imageData: '/9j/4AAQSkZJRgABAQAAAQABAAD',
      })
      .expect(200);

    expect(llmService.generateDiagnosis).toHaveBeenCalledWith({
      symptoms: [],
      image: {
        mimeType: 'image/jpeg',
        data: '/9j/4AAQSkZJRgABAQAAAQABAAD',
      },
    });
  });
});
