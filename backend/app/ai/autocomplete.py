import os
import re
import random
from collections import defaultdict
from typing import Dict, List, Tuple

import pandas as pd


Token = str
Bigram = Tuple[Token, Token]


class AutocompleteModel:
    """
    Simple bigram Markov model per sentiment.

    Key idea:
    - For each sentiment (positive/negative/etc.), we build:
      (word_i, word_{i+1}) -> [word_{i+2}, ...]
    - At inference, we look at the last two words typed and sample
      a likely continuation from the chosen sentiment bucket.
    """

    def __init__(self) -> None:
        # sentiment -> bigram -> list[next_token]
        self.models: Dict[str, Dict[Bigram, List[Token]]] = {
            "positive": defaultdict(list),
            "negative": defaultdict(list),
            "neutral": defaultdict(list),
        }

    @staticmethod
    def _tokenize(text: str) -> List[Token]:
        # Very simple tokenizer: words (including accented) and basic punctuation
        # NOTE: we want \w inside the character class, not a literal backslash + w
        return re.findall(r"[\w']+|[.,!?;]", text.lower())

    def train(self, csv_path: str) -> None:
        try:
            if not os.path.exists(csv_path):
                print(f"Autocomplete: CSV not found at {csv_path}")
                return

            df = pd.read_csv(csv_path)
            if "message" not in df.columns or "sentiment" not in df.columns:
                print("Autocomplete: CSV must contain 'message' and 'sentiment' columns.")
                return

            df = df.dropna(subset=["message", "sentiment"])

            for _, row in df.iterrows():
                text = str(row["message"])
                sentiment_raw = str(row["sentiment"]).strip().lower()

                # Normalize some common label variants if your CSV ever changes
                if sentiment_raw.startswith("pos"):
                    sentiment = "positive"
                elif sentiment_raw.startswith("neg"):
                    sentiment = "negative"
                else:
                    sentiment = "neutral"

                if sentiment not in self.models:
                    continue

                tokens = self._tokenize(text)
                if len(tokens) < 3:
                    continue

                # Build bigram -> next token
                for i in range(len(tokens) - 2):
                    key: Bigram = (tokens[i], tokens[i + 1])
                    next_token = tokens[i + 2]
                    self.models[sentiment][key].append(next_token)

            print("Autocomplete model trained successfully.")
        except Exception as e:
            print(f"Autocomplete: error while training: {e}")

    def _get_bucket_key(self, slider_state: int) -> str:
        """
        Map pill slider state to sentiment bucket.
        0 = positive (left), 1 = neutral (middle), 2 = negative (right)
        """
        if slider_state == 0:
            return "positive"
        if slider_state == 2:
            return "negative"
        return "neutral"

    def predict(self, text: str, slider_state: int, *, max_tries: int = 3) -> str | None:
        tokens = self._tokenize(text)
        if len(tokens) < 2:
            return None

        sentiment_key = self._get_bucket_key(slider_state)
        bucket = self.models.get(sentiment_key) or {}
        if not bucket:
            return None

        last_two: Bigram = (tokens[-2], tokens[-1])
        # Direct bigram match
        choices = bucket.get(last_two)
        if choices:
            return random.choice(choices)

        # Fallback: try degrading the history by sampling from any key
        # whose second token matches the last token to keep context weakly.
        last = tokens[-1]
        candidates: List[Token] = []
        for (w1, w2), next_tokens in bucket.items():
            if w2 == last:
                candidates.extend(next_tokens)
                if len(candidates) > max_tries * 5:
                    break

        if candidates:
            return random.choice(candidates)

        return None


# Singleton instance used by the app
autocomplete_engine = AutocompleteModel()


