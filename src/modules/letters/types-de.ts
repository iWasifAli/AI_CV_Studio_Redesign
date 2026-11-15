import type { LetterTypeId } from './types';

/**
 * German no-AI first drafts (formal "Sie"). Same placeholders as the English ones; `{x: bei }`
 * adds " bei <answer>" only when answered.
 */
export const STARTERS_DE: Record<LetterTypeId, { subject: string; starter: string[] }> = {
  cover: {
    subject: 'Bewerbung als {role}',
    starter: [
      'hiermit bewerbe ich mich um die Stelle als {role}{organisation: bei }.',
      '{why}',
      'Meinen Lebenslauf finden Sie im Anhang. Er zeigt meine Erfahrung und die Kenntnisse, die ich in die Stelle einbringen würde.',
      'Ich könnte {availability} beginnen.',
      'Vielen Dank für die Berücksichtigung meiner Bewerbung.',
    ],
  },
  resignation: {
    subject: 'Kündigung',
    starter: [
      'hiermit kündige ich mein Arbeitsverhältnis als {role} bei {organisation} fristgerecht. Mein letzter Arbeitstag ist der {lastDay}.',
      '{thanks}',
      '{handover}',
      'Ich danke Ihnen für die Möglichkeiten, die ich hier hatte, und wünsche Ihnen und dem Team weiterhin viel Erfolg.',
    ],
  },
  reference: {
    subject: 'Bitte um eine Referenz',
    starter: [
      'ich hoffe, es geht Ihnen gut. Ich bewerbe mich um die Stelle als {role}{organisation: bei } und wäre Ihnen sehr dankbar, wenn Sie mir als Referenz zur Verfügung stünden.',
      'Zur Erinnerung: {relationship}.',
      'Der Arbeitgeber würde sich {deadline} bei Ihnen melden.',
      'Gern sende ich Ihnen meinen Lebenslauf und die Stellenbeschreibung.',
      'Vielen Dank, dass Sie darüber nachdenken.',
    ],
  },
  'thank-you': {
    subject: 'Vielen Dank für das Gespräch – {role}',
    starter: [
      'vielen Dank, dass Sie sich{when:} die Zeit genommen haben, mit mir über die Stelle als {role} bei {organisation} zu sprechen.',
      '{highlight}',
      'Unser Gespräch hat mein Interesse an der Stelle bestätigt, und ich würde mich freuen, Teil des Teams zu werden.',
      'Bitte lassen Sie mich wissen, wenn Sie noch etwas von mir benötigen.',
    ],
  },
  'follow-up': {
    subject: 'Nachfrage zu meiner Bewerbung als {role}',
    starter: [
      'ich habe mich{appliedOn:} um die Stelle als {role} bei {organisation} beworben und möchte mich nach dem Stand meiner Bewerbung erkundigen.',
      'Ich bin weiterhin sehr an der Stelle interessiert und stelle Ihnen gern weitere Informationen zur Verfügung.',
      'Könnten Sie mir die nächsten Schritte mitteilen? Vielen Dank für Ihre Zeit.',
    ],
  },
  'offer-accept': {
    subject: 'Annahme Ihres Angebots: {role}',
    starter: [
      'mit großer Freude nehme ich Ihr Angebot für die Stelle als {role} bei {organisation} an.',
      'Ich bestätige meinen Arbeitsbeginn am {startDate}.',
      '{terms}',
      'Vielen Dank für diese Gelegenheit. Bitte lassen Sie mich wissen, ob Sie vor meinem ersten Tag noch etwas von mir benötigen.',
    ],
  },
  salary: {
    subject: 'Ihr Angebot für die Stelle als {role}',
    starter: [
      'vielen Dank für Ihr Angebot für die Stelle als {role} bei {organisation}. Ich freue mich darauf, Teil des Teams zu werden.',
      'Ihr Angebot lautet {offer}. Aufgrund meiner Erfahrung möchte ich Sie bitten, {ask} in Betracht zu ziehen.',
      '{reasons}',
      'Mir liegt an einer Lösung, die für beide Seiten passt, und ich spreche gern darüber.',
    ],
  },
  networking: {
    subject: 'Kurze Vorstellung',
    starter: [
      'ich melde mich bei Ihnen, weil {connection}.',
      '{about}',
      'Ich wäre Ihnen sehr dankbar für {goal}, zu einem Zeitpunkt, der Ihnen passt.',
      'Vielen Dank fürs Lesen – und kein Problem, falls es gerade nicht passt.',
    ],
  },
  'personal-statement': {
    subject: 'Motivationsschreiben: {programme}',
    starter: [
      'Ich bewerbe mich für {programme}{institution: an der }.',
      '{why}',
      '{proof}',
      'Nach dem Abschluss möchte ich {goal}.',
    ],
  },
  bio: {
    subject: 'Über {name}',
    starter: ['{name}, {headline}{location: , mit Sitz in }.', '{focus}'],
  },
};
