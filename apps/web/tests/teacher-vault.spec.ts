import {describe, expect, it} from 'vitest';
import {
  openTeacherVault,
  sealTeacherVault,
} from '../lib/teacher-vault.ts';
import type {TeacherStudentProfile} from '../lib/teacher-records.ts';

const profile: TeacherStudentProfile = {
  pseudonymousStudentId: '별빛-07',
  gradeAndUnit: {value: '초등학교 6학년 · 분수', provenance: 'STUDENT_STATED'},
  explicitInterest: {value: '우주', provenance: 'STUDENT_STATED'},
  supportPreference: {value: '그림 힌트', provenance: 'STUDENT_STATED'},
  confirmedMisconception: {value: '', provenance: 'NEEDS_CONFIRMATION'},
  misconceptionEvidence: {value: '', provenance: 'NEEDS_CONFIRMATION'},
  teacherNote: {value: '민감하지 않은 수업 메모', provenance: 'TEACHER_OBSERVED'},
  updatedAt: '2026-08-15T04:00:00.000Z',
};

describe('브라우저 로컬 교사 프로파일 보관', () => {
  it('키를 저장하지 않고 AES-GCM 암호문으로 저장·복원한다', async () => {
    const opened = await openTeacherVault('충분히-긴-교사-테스트-키');
    const sealed = await sealTeacherVault(profile, opened.session);
    expect(sealed).not.toContain(profile.pseudonymousStudentId);
    expect(sealed).not.toContain(profile.teacherNote.value);

    const restored = await openTeacherVault('충분히-긴-교사-테스트-키', sealed);
    expect(restored.profile).toEqual(profile);
  });

  it('다른 키나 변조된 암호문으로는 복원하지 않는다', async () => {
    const opened = await openTeacherVault('원래-교사-테스트-키');
    const sealed = await sealTeacherVault(profile, opened.session);
    await expect(openTeacherVault('다른-교사-테스트-키', sealed)).rejects.toThrow();

    const envelope = JSON.parse(sealed) as {ciphertext: string};
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    await expect(
      openTeacherVault('원래-교사-테스트-키', JSON.stringify(envelope)),
    ).rejects.toThrow();
  });
});
