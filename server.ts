import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { HfInference } from "@huggingface/inference";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy route for HuggingFace Sentiment Analysis
  app.post("/api/sentiment", async (req, res) => {
    try {
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      if (!process.env.HF_TOKEN) {
        console.warn("HF_TOKEN is not set. Inference API is not authorized.");
        return res.status(401).json({ error: "HF_TOKEN missing" });
      }

      const hf = new HfInference(process.env.HF_TOKEN);

      try {
        // We use a different model that is actually supported by the Free Serverless API.
        // The previous model (will702/indo-roBERTa-financial-sentiment-v2) is no longer hosted on the free tier.
        const response = await hf.textClassification({
          model: 'mdhugol/indonesia-bert-sentiment-classification',
          inputs: text.substring(0, 480)
        });

        // The hf SDK returns an array of label/score objects. 
        // We wrap it in a nested array [[...]] so the frontend App.tsx doesn't break,
        // since it originally expected the raw rest API output format: [[{label, score}, ...]]
        return res.json([response]);
      } catch (hfError: any) {
        console.error("HF Inference Provider Error:", hfError.message);
        if (hfError.message?.includes('503') || hfError.message?.toLowerCase().includes('loading')) {
          return res.status(503).json({ error: "Model is warming up" });
        }
        if (hfError.message?.includes('401') || hfError.message?.includes('Unauthorized')) {
          return res.status(401).json({ error: "Hugging Face requires a valid API token." });
        }
        return res.status(500).json({ error: "Hugging Face API failed", details: hfError.message });
      }

    } catch (error: any) {
      console.error("Sentiment proxy error:", error);
      res.status(500).json({ error: "Internal server error connecting to sentiment model." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
