import { describe, it, expect } from 'vitest';
import { UserModel, SessionModel, type User, type Session } from '../src/index.js';

describe('UserModel & SessionModel (packages/db)', () => {
  describe('UserModel', () => {
    const validUser: User = {
      id: 'usr-12345-uuid',
      googleId: 'google-sub-98765',
      email: 'investigator@target-corp.com',
      name: 'Agent Mulder',
      picture: 'https://lh3.googleusercontent.com/a/default-avatar',
    };

    it('validates a complete, valid User document', () => {
      const doc = new UserModel(validUser);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.id).toBe('usr-12345-uuid');
      expect(doc.googleId).toBe('google-sub-98765');
      expect(doc.email).toBe('investigator@target-corp.com');
      expect(doc.name).toBe('Agent Mulder');
      expect(doc.picture).toBe('https://lh3.googleusercontent.com/a/default-avatar');
    });

    it('validates a User document with optional name and picture omitted', () => {
      const { name, picture, ...userWithoutOptionals } = validUser;
      const doc = new UserModel(userWithoutOptionals);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.name).toBeUndefined();
      expect(doc.picture).toBeUndefined();
    });

    it('fails validation when required fields are missing', () => {
      const doc = new UserModel({});
      const err = doc.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['id']).toBeDefined();
      expect(err?.errors['googleId']).toBeDefined();
      expect(err?.errors['email']).toBeDefined();
    });

    it('has unique index defined on id and googleId, and index on email', () => {
      const schemaIndexes = UserModel.schema.indexes();
      const indexFields = schemaIndexes.map((idx) => Object.keys(idx[0]));

      const hasIdIndex = indexFields.some((keys) => keys.includes('id'));
      const hasGoogleIdIndex = indexFields.some((keys) => keys.includes('googleId'));
      const hasEmailIndex = indexFields.some((keys) => keys.includes('email'));

      expect(hasIdIndex).toBe(true);
      expect(hasGoogleIdIndex).toBe(true);
      expect(hasEmailIndex).toBe(true);

      const idIdx = schemaIndexes.find((idx) => 'id' in idx[0]);
      expect(idIdx?.[1]?.unique).toBe(true);

      const googleIdIdx = schemaIndexes.find((idx) => 'googleId' in idx[0]);
      expect(googleIdIdx?.[1]?.unique).toBe(true);
    });
  });

  describe('SessionModel', () => {
    const validSession: Session = {
      id: 'sess-abc-123',
      userId: 'usr-12345-uuid',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    it('validates a correct Session document', () => {
      const doc = new SessionModel(validSession);
      const err = doc.validateSync();
      expect(err).toBeUndefined();
      expect(doc.id).toBe('sess-abc-123');
      expect(doc.userId).toBe('usr-12345-uuid');
      expect(doc.expiresAt).toBeInstanceOf(Date);
    });

    it('fails validation when required fields are missing', () => {
      const doc = new SessionModel({});
      const err = doc.validateSync();
      expect(err).toBeDefined();
      expect(err?.errors['id']).toBeDefined();
      expect(err?.errors['userId']).toBeDefined();
      expect(err?.errors['expiresAt']).toBeDefined();
    });

    it('has unique index on id, index on userId, and TTL index on expiresAt', () => {
      const schemaIndexes = SessionModel.schema.indexes();
      const indexFields = schemaIndexes.map((idx) => Object.keys(idx[0]));

      expect(indexFields.some((keys) => keys.includes('id'))).toBe(true);
      expect(indexFields.some((keys) => keys.includes('userId'))).toBe(true);
      expect(indexFields.some((keys) => keys.includes('expiresAt'))).toBe(true);

      const idIdx = schemaIndexes.find((idx) => 'id' in idx[0]);
      expect(idIdx?.[1]?.unique).toBe(true);

      const expIdx = schemaIndexes.find((idx) => 'expiresAt' in idx[0]);
      expect(expIdx?.[1]?.expireAfterSeconds).toBe(0);
    });
  });
});
