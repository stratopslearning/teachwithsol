/**
 * Flag authorization checks that use users.role or professorId equality.
 * Metadata writes (assigning professorId on insert) are not matched.
 */

const ROLE_COMPARE =
  /(user|authUser|viewer|actor)\.role\s*===?\s*['"`](STUDENT|PROFESSOR|ADMIN)['"`]|['"`](STUDENT|PROFESSOR|ADMIN)['"`]\s*===?\s*(user|authUser|viewer|actor)\.role|\.role\s*!==?\s*['"`](STUDENT|PROFESSOR|ADMIN)['"`]/;

const PROFESSOR_ID_COMPARE =
  /(professorId|quiz\.professorId|bot\.professorId|chatbot\.professorId|interactive\.professorId)\s*===?\s*(user|authUser)\.id|(user|authUser)\.id\s*===?\s*(professorId|.*\.professorId)/;

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow users.role / professorId authorization checks.',
    },
    schema: [],
    messages: {
      legacyRole:
        'users.role authorization check. users.role was dropped; use authorize() / role bindings.',
      legacyProfessorId:
        'professorId is authorship metadata, not authority. Use authorize() / role bindings.',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        const text = context.sourceCode.getText(node);
        if (ROLE_COMPARE.test(text)) {
          context.report({ node, messageId: 'legacyRole' });
          return;
        }
        if (PROFESSOR_ID_COMPARE.test(text)) {
          context.report({ node, messageId: 'legacyProfessorId' });
        }
      },
    };
  },
};

export default rule;
