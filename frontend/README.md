# React + Vite

## AI Financial Advisor

The protected `/advisor` page calls the `ai-advisor` Supabase Edge Function. The function validates the caller's Supabase access token and queries transactions, budgets, goals, and contributions with that user's JWT, so the existing Row Level Security policies stay in force. It sends only 12-month currency/category aggregates, current budget performance, goal progress, and the user's chat text to Gemini; transaction descriptions and database IDs are omitted.

The function uses Google's Gemini 3.1 Flash-Lite API. Google currently lists a free tier, but notes that free-tier content may be used to improve its products. The page requires explicit opt-in before it sends data. Review the [Gemini API pricing and data terms](https://ai.google.dev/gemini-api/docs/pricing) before enabling it.

### Configure and deploy

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. From the repository's `frontend` directory, link the Supabase project used by this frontend (once), set the secret, and deploy the function:

   ```sh
   npx supabase link --project-ref your-project-ref
   npx supabase secrets set GEMINI_API_KEY=your-key
   npx supabase functions deploy ai-advisor
   ```

   Keep the key in Supabase secrets. Do not add it to a `VITE_` variable or frontend `.env` file.
3. Start the frontend as usual with `npm.cmd run dev` (or `npm run dev`). The existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` settings must point to the same Supabase project where the function is deployed.

Gemini free-tier quotas can change and may return rate-limit errors. The page reports missing configuration, authentication, provider, quota, and network errors without substituting canned or rule-based AI responses.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
