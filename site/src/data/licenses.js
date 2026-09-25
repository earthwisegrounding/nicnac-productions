// Lease tiers, from Nick's "Website prices and agreements" sheet (2026-09-24).
// Every beat in the vault is offered on the same three tiers.
//
// checkout: paste a payment link per tier (e.g. a Stripe Payment Link) to turn the
// "DM to license" button into a real "Buy" button. The beat's slug is passed along as
// ?client_reference_id=<slug> so each order shows which beat was bought.
export const licenses = [
  {
    id: 'mp3',
    name: 'MP3 Lease',
    price: 30,
    files: 'MP3',
    checkout: '',
    terms: {
      use: 'Music recording',
      copies: 'Up to 2,000',
      streams: '500,000',
      videos: '1',
      live: 'Non-profit only, unlimited',
      radio: null,
    },
  },
  {
    id: 'wav',
    name: 'WAV Lease',
    price: 60,
    files: 'WAV',
    checkout: '',
    terms: {
      use: 'Music recording',
      copies: 'Up to 2,000',
      streams: '500,000',
      videos: '1',
      live: 'Non-profit only, unlimited',
      radio: null,
    },
  },
  {
    id: 'trackout',
    name: 'Trackout Lease',
    price: 120,
    files: 'MP3 + WAV',
    checkout: '',
    badge: 'Unlimited',
    terms: {
      use: 'Music recording',
      copies: 'Unlimited',
      streams: 'Unlimited',
      videos: 'Unlimited',
      live: 'For-profit shows',
      radio: 'Unlimited stations',
    },
  },
];

export const termRows = [
  ['use', 'Use'],
  ['copies', 'Copies'],
  ['streams', 'Online streams'],
  ['videos', 'Music videos'],
  ['live', 'Live shows'],
  ['radio', 'Radio'],
];

export const fromPrice = Math.min(...licenses.map((l) => l.price));
