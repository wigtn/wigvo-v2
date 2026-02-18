"use client";

import { useTranslations } from "next-intl";
import { Check, Zap, Crown } from "lucide-react";

interface Plan {
  nameKey: string;
  price: string;
  periodKey: string;
  descriptionKey: string;
  featureKeys: string[];
  ctaKey: string;
  highlighted: boolean;
  disabled: boolean;
  icon: React.ReactNode;
}

const PLANS: Plan[] = [
  {
    nameKey: "freeName",
    price: "$0",
    periodKey: "freePeriod",
    descriptionKey: "freeDescription",
    featureKeys: [
      "freeFeature1",
      "freeFeature2",
      "freeFeature3",
      "freeFeature4",
    ],
    ctaKey: "freeCta",
    highlighted: false,
    disabled: true,
    icon: <Zap className="size-5" />,
  },
  {
    nameKey: "proName",
    price: "$9",
    periodKey: "proPeriod",
    descriptionKey: "proDescription",
    featureKeys: [
      "proFeature1",
      "proFeature2",
      "proFeature3",
      "proFeature4",
      "proFeature5",
      "proFeature6",
    ],
    ctaKey: "proCta",
    highlighted: true,
    disabled: false,
    icon: <Crown className="size-5" />,
  },
];

export default function PricingPanel() {
  const t = useTranslations("pricing");

  const handleSubscribe = () => {
    // TODO: Connect to Stripe checkout
    alert("Payment integration coming soon!");
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex flex-col items-center px-4 sm:px-6 py-8 sm:py-12">
        <div className="w-full max-w-[720px] text-center space-y-8">
          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[#0F172A]">
              {t("title")}
            </h1>
            <p className="text-sm text-[#94A3B8]">
              {t("subtitle")}
            </p>
          </div>

          {/* Plans */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PLANS.map((plan) => (
              <div
                key={plan.nameKey}
                className={`relative rounded-2xl border p-6 text-left transition-all ${
                  plan.highlighted
                    ? "border-[#0F172A] shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                    : "border-[#E2E8F0]"
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-2.5 left-4 bg-[#0F172A] text-white text-[10px] font-semibold px-2.5 py-0.5 rounded-full">
                    {t("recommended")}
                  </span>
                )}

                <div className="space-y-5">
                  {/* Plan icon & name */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      plan.highlighted
                        ? "bg-[#0F172A] text-white"
                        : "bg-[#F1F5F9] text-[#0F172A]"
                    }`}>
                      {plan.icon}
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-[#64748B]">
                        {t(plan.nameKey)}
                      </h2>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-bold text-[#0F172A]">
                          {plan.price}
                        </span>
                        <span className="text-xs text-[#94A3B8]">
                          {t(plan.periodKey)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#94A3B8]">
                    {t(plan.descriptionKey)}
                  </p>

                  {/* Features */}
                  <ul className="space-y-2.5">
                    {plan.featureKeys.map((key) => (
                      <li
                        key={key}
                        className="flex items-start gap-2.5 text-[13px] text-[#334155]"
                      >
                        <Check className="size-4 text-teal-500 shrink-0 mt-0.5" />
                        {t(key)}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <button
                    onClick={plan.disabled ? undefined : handleSubscribe}
                    disabled={plan.disabled}
                    className={`w-full rounded-xl py-2.5 text-sm font-medium transition-colors ${
                      plan.highlighted
                        ? "bg-[#0F172A] text-white hover:bg-[#1E293B]"
                        : "bg-[#F1F5F9] text-[#94A3B8] cursor-default"
                    }`}
                  >
                    {t(plan.ctaKey)}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Footer note */}
          <p className="text-xs text-[#CBD5E1]">
            {t("footer")}
          </p>
        </div>
      </div>
    </div>
  );
}
