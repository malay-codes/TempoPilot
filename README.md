# [TempoPilot](https://vercel.com/malays-projects-bdae0712/tempo-pilot)

[TempoPilot](https://vercel.com/malays-projects-bdae0712/tempo-pilot) is a React + Vite workspace for Tempo testnet flows with a clean UI.

## Features

- Wallet onboarding and network check
- Payment transfer with memo support
- Group expense split and settlement plan
- Swap quote and guarded swap execution
- Activity timeline with explorer tx links


## Tempo Testnet Values

- Network: Tempo Testnet (Moderato)
- Chain ID: `42431`
- RPC: `https://rpc.moderato.tempo.xyz`
- Explorer: `https://explore.tempo.xyz`
- AlphaUSD: `0x20c0000000000000000000000000000000000001`
- BetaUSD: `0x20c0000000000000000000000000000000000002`
- ThetaUSD: `0x20c0000000000000000000000000000000000003`
- pathUSD: `0x20c0000000000000000000000000000000000000`

## Getting Started

```bash
npm install
npm run dev
```

Open the local URL shown in terminal (usually `http://localhost:5173`).

## Scripts

```bash
npm run dev      # start dev server
npm run build    # production build
npm run preview  # preview production build
```

## Notes

- App uses local storage for session and app state persistence.
- Landing screen appears until user signs in.
