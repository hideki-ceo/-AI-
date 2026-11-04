import { Benefits } from "@/components/lp/Benefits";
import { Faq } from "@/components/lp/Faq";
import { Features } from "@/components/lp/Features";
import { Footer } from "@/components/lp/Footer";
import { Header } from "@/components/lp/Header";
import { Hero } from "@/components/lp/Hero";
import { JsonLd } from "@/components/lp/JsonLd";
import { Pricing } from "@/components/lp/Pricing";
import { Problems } from "@/components/lp/Problems";

export default function Home() {
  return (
    <>
      <JsonLd />
      <Header />
      <main>
        <Hero />
        <Problems />
        <Features />
        <Benefits />
        <Pricing />
        <Faq />
      </main>
      <Footer />
    </>
  );
}
