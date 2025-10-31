import "@rainbow-me/rainbowkit/styles.css";
import { ScaffoldEthAppWithProviders } from "~~/components/ScaffoldEthAppWithProviders";
import { ThemeProvider } from "~~/components/ThemeProvider";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "AnyEarn",
  description: "Your Gig Market",
});

const FullScreenMapLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning className={``}>
      <body className="overflow-hidden">
        <ThemeProvider enableSystem>
          <ScaffoldEthAppWithProviders>{children}</ScaffoldEthAppWithProviders>
        </ThemeProvider>
      </body>
    </html>
  );
};

export default FullScreenMapLayout;
