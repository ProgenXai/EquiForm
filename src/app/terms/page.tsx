"use client";

import { useRouter } from "next/navigation";

const LAST_UPDATED = "July 10, 2026";

export default function TermsOfServicePage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-zinc-100">
      <button
        type="button"
        onClick={() => router.back()}
        className="px-6 pt-6 text-sm font-medium text-accent transition hover:text-accent-hover"
      >
        ← Back
      </button>

      <main className="mx-auto max-w-2xl px-6 pb-16 pt-6">
        <h1 className="mb-2 text-2xl font-bold text-white">
          Terms of Service
        </h1>
        <p className="mb-8 text-sm text-zinc-500">
          Last updated: {LAST_UPDATED}
        </p>

        <p className="mb-6 leading-relaxed text-zinc-300">
          These Terms of Service (&quot;Terms&quot;) govern your use of
          EquiForm, operated by ProgenXai LLC (&quot;EquiForm,&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an
          account or using EquiForm, you agree to these Terms. If you do not
          agree, please do not use the service.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          1. The service
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          EquiForm uses artificial intelligence to analyze photos of horses
          and generate conformation scores, reports, and optional 3D models.
          You upload photos and information about your horse, and we return
          an AI-generated analysis.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          2. Not veterinary advice
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          EquiForm&apos;s reports are AI-generated and provided for
          informational and educational purposes only. They are not
          veterinary advice, diagnosis, or a substitute for evaluation by a
          qualified veterinarian or certified equine professional. See our{" "}
          <a
            href="/disclaimer"
            className="font-medium text-accent transition hover:text-accent-hover"
          >
            AI Analysis Disclaimer
          </a>{" "}
          for more detail.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          3. Accounts
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          You must provide accurate information when creating an account and
          are responsible for maintaining the security of your account
          credentials. You must be at least 18 years old, or the age of
          majority in your jurisdiction, to use EquiForm.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          4. Photos and content you submit
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          You retain ownership of the photos and information you submit. By
          uploading a photo, you confirm that you have the right to use it
          and to have it processed by EquiForm and its third-party AI
          processing providers for the purpose of generating your analysis.
          You agree not to upload content that infringes on others&apos;
          rights or that is unlawful, abusive, or offensive.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          5. Payments and refunds
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          Report credits are purchased through Stripe. Prices are listed at
          the time of purchase. Because reports are generated on-demand and
          consume third-party AI processing as soon as you submit a horse for
          analysis, purchases are generally non-refundable once a report has
          been generated. If you believe you were charged in error, contact
          us and we will review it in good faith.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          6. Acceptable use
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          You agree not to misuse EquiForm, including by attempting to
          disrupt the service, reverse-engineer our AI pipeline, or use the
          service for any unlawful purpose.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          7. Disclaimer of warranties
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          EquiForm is provided &quot;as is&quot; without warranties of any
          kind, express or implied. We do not guarantee that AI-generated
          scores or reports will be accurate, complete, or fit for any
          particular purpose. Results may vary based on photo quality, angle,
          lighting, and other factors outside our control.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          8. Limitation of liability
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          To the fullest extent permitted by law, Hennis Performance Horses,
          ProgenXai LLC, and EquiForm&apos;s founders, employees, and agents
          are not liable for any decisions made based on AI-generated
          conformation scores or reports, or for any indirect, incidental, or
          consequential damages arising from your use of EquiForm.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          9. Changes to the service or these Terms
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          We may update EquiForm or these Terms from time to time. We will
          update the &quot;Last updated&quot; date above when we make
          changes. Continued use of EquiForm after changes take effect means
          you accept the updated Terms.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          10. Termination
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          You may stop using EquiForm and delete your account at any time. We
          may suspend or terminate accounts that violate these Terms.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          11. Contact us
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          If you have questions about these Terms, contact us at{" "}
          <a
            href="mailto:EquiFormApp@gmail.com"
            className="font-medium text-accent transition hover:text-accent-hover"
          >
            EquiFormApp@gmail.com
          </a>
          .
        </p>

        <p className="mt-10 text-sm italic text-zinc-500">
          This is a general Terms of Service template and has not been
          reviewed by an attorney. Consider having a lawyer review it as
          EquiForm grows.
        </p>
      </main>
    </div>
  );
}
