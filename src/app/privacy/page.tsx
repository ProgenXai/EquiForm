"use client";

import { useRouter } from "next/navigation";

const LAST_UPDATED = "July 10, 2026";

export default function PrivacyPolicyPage() {
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
        <h1 className="mb-2 text-2xl font-bold text-white">Privacy Policy</h1>
        <p className="mb-8 text-sm text-zinc-500">
          Last updated: {LAST_UPDATED}
        </p>

        <p className="mb-6 leading-relaxed text-zinc-300">
          EquiForm (&quot;EquiForm,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;) is operated by ProgenXai LLC. This Privacy Policy
          explains what information we collect when you use EquiForm, how we
          use it, and the choices you have.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Information we collect
        </h2>
        <p className="mb-2 leading-relaxed text-zinc-300">
          When you create an account and use EquiForm, we collect:
        </p>
        <ul className="mb-6 list-disc space-y-2 pl-5 leading-relaxed text-zinc-300">
          <li>
            <span className="font-medium text-white">Account information:</span>{" "}
            your name and email address.
          </li>
          <li>
            <span className="font-medium text-white">Horse information:</span>{" "}
            details you provide about your horses, such as name, breed, age,
            sex, coat color, and discipline.
          </li>
          <li>
            <span className="font-medium text-white">Photos:</span> images of
            horses you upload for conformation analysis.
          </li>
          <li>
            <span className="font-medium text-white">Payment information:</span>{" "}
            processed directly by Stripe when you purchase report credits. We
            do not store your full card details ourselves.
          </li>
          <li>
            <span className="font-medium text-white">Usage information:</span>{" "}
            basic technical information such as log data, which helps us
            diagnose issues and keep the service running.
          </li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          How we use your information
        </h2>
        <ul className="mb-6 list-disc space-y-2 pl-5 leading-relaxed text-zinc-300">
          <li>To generate your AI conformation analysis reports and, where purchased, 3D models.</li>
          <li>To create and maintain your account, and to process payments for report credits.</li>
          <li>To send you transactional emails, such as report-ready notifications and receipts.</li>
          <li>To send you product updates, if you opt in to receive them.</li>
          <li>To respond to questions or support requests you send us.</li>
          <li>To maintain the security, reliability, and integrity of EquiForm.</li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          How your photos are processed
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          Photos you upload are sent to third-party AI processing providers to
          generate your report, including services used for conformation
          scoring, landmark detection, background removal (when applicable),
          and 3D model generation (for 3D-enabled packages). These providers
          process your images solely to return results to EquiForm and are
          not authorized to use your photos for any other purpose.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Third-party service providers
        </h2>
        <p className="mb-2 leading-relaxed text-zinc-300">
          We use trusted third-party providers to operate EquiForm. Each
          processes data only as needed to provide their service to us:
        </p>
        <ul className="mb-6 list-disc space-y-2 pl-5 leading-relaxed text-zinc-300">
          <li>
            <span className="font-medium text-white">
              Account and data hosting:
            </span>{" "}
            authentication, database, and file storage.
          </li>
          <li>
            <span className="font-medium text-white">Payment processing:</span>{" "}
            to securely handle purchases of report credits.
          </li>
          <li>
            <span className="font-medium text-white">Email delivery:</span>{" "}
            to send transactional and, if opted in, product update emails.
          </li>
          <li>
            <span className="font-medium text-white">Website hosting:</span>{" "}
            to run and serve the EquiForm application.
          </li>
          <li>
            <span className="font-medium text-white">
              AI photo analysis and 3D modeling:
            </span>{" "}
            to generate conformation scores, reports, and optional 3D models
            from your uploaded photos.
          </li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Data retention
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          We retain your account information, horse profiles, photos, and
          reports for as long as your account is active, so you can access
          your report history at any time. You can delete individual horses,
          reports, or your entire account at any time from within the app;
          deleting a horse or report also deletes its associated photos from
          our storage.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Your choices
        </h2>
        <ul className="mb-6 list-disc space-y-2 pl-5 leading-relaxed text-zinc-300">
          <li>You can update your profile information at any time.</li>
          <li>You can delete individual horses or reports from My Horses and My Reports.</li>
          <li>You can opt out of product update emails at signup or by contacting us.</li>
          <li>
            You can request deletion of your account and associated data by
            contacting us at{" "}
            <a
              href="mailto:EquiFormApp@gmail.com"
              className="font-medium text-accent transition hover:text-accent-hover"
            >
              EquiFormApp@gmail.com
            </a>
            .
          </li>
        </ul>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Data security
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          We use industry-standard third-party providers that maintain their
          own security safeguards to protect your information. No method of
          transmission or storage is 100% secure, and we cannot guarantee
          absolute security.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Children&apos;s privacy
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          EquiForm is not directed to children under 13, and we do not
          knowingly collect information from children under 13.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Changes to this policy
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          We may update this Privacy Policy from time to time. We will update
          the &quot;Last updated&quot; date above when we do.
        </p>

        <h2 className="mb-3 mt-8 text-lg font-semibold text-white">
          Contact us
        </h2>
        <p className="mb-6 leading-relaxed text-zinc-300">
          If you have questions about this Privacy Policy, contact us at{" "}
          <a
            href="mailto:EquiFormApp@gmail.com"
            className="font-medium text-accent transition hover:text-accent-hover"
          >
            EquiFormApp@gmail.com
          </a>
          .
        </p>

        <p className="mt-10 text-sm italic text-zinc-500">
          This is a general Privacy Policy template and has not been reviewed
          by an attorney. Consider having a lawyer review it as EquiForm
          grows.
        </p>
      </main>
    </div>
  );
}
