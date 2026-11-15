import type { Metadata } from 'next';
import { Container } from '@/components/ui/misc';
import { CardStudio } from '@/features/presence/card-studio';

export const metadata: Metadata = { title: 'Email signature and business card' };

export default function Page() {
  return (
    <Container className="max-w-[1000px] py-8 md:py-12">
      <h1 className="font-display text-3xl font-semibold">Email signature and business card</h1>
      <p className="text-ink-muted mt-2 max-w-2xl">
        Made from your CV, in its colour and fonts. Copy the signature into your email settings;
        print the card or send it to a print shop.
      </p>
      <CardStudio />
    </Container>
  );
}
