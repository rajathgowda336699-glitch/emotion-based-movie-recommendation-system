from flask import Flask, render_template, request, jsonify
from pathlib import Path
from urllib.parse import quote
import html
import math
import re

import pandas as pd


app = Flask(__name__)

DATASET_PATH = Path(__file__).resolve().parent / "data" / "amazon prime movies.csv"
PER_PAGE = 8

EMOTION_KEYWORDS = {
    "happy": ["happy", "fun", "funny", "comedy", "feel good", "feel-good", "joy", "cheerful", "hilarious", "romantic comedy", "laugh", "smile", "lighthearted", "upbeat", "humor", "humour", "satire", "parody", "slapstick"],
    "sad": ["sad", "drama", "tragedy", "tragic", "loss", "grief", "heartbreak", "emotional", "melancholy", "tearjerker", "tear", "sorrow", "depressing", "poignant", "bittersweet"],
    "angry": ["action", "revenge", "war", "crime", "fight", "violence", "thriller", "gangster", "battle", "vigilante", "brutal", "intense", "explosive", "martial arts", "shootout"],
    "relaxed": ["romance", "love", "family", "friendship", "slice of life", "feel good", "music", "drama", "journey", "peaceful", "calm", "heartwarming", "wholesome", "cozy", "gentle"],
    "excited": ["adventure", "thriller", "mystery", "sci-fi", "fantasy", "action", "superhero", "mission", "suspense", "epic", "blockbuster", "chase", "heist", "spy", "supernatural"],
}

VALID_LANGUAGES = ["English", "Hindi", "Tamil", "Telugu", "Kannada"]

_movie_index = None
_movie_index_mtime = None


def _clean(value):
    if pd.isna(value):
        return ""
    return (
        str(value)
        .replace("Ã‚", "")
        .replace("Ãƒâ€š", "")
        .replace("\xa0", " ")
        .strip()
    )


def _col(df, *candidates):
    lower_map = {c.lower(): c for c in df.columns}
    for candidate in candidates:
        if candidate.lower() in lower_map:
            return lower_map[candidate.lower()]
    return None


def _canonical_language(value):
    text = _clean(value).lower()
    for language in VALID_LANGUAGES:
        if text == language.lower():
            return language
    return ""


def _year_value(value):
    match = re.search(r"\d{4}", str(value or ""))
    return match.group(0) if match else ""


def _title_key(value):
    text = _clean(value).lower()
    text = re.sub(r"\s*\([^)]*\)\s*$", "", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()



def _poster_placeholder(title):
    label = html.escape((title or "Movie")[:42])
    svg = (
        "<svg xmlns='http://www.w3.org/2000/svg' width='300' height='450' viewBox='0 0 300 450'>"
        "<defs>"
        "<filter id='glow' x='-60%' y='-60%' width='220%' height='220%'>"
        "<feGaussianBlur stdDeviation='4' result='blur'/>"
        "<feColorMatrix in='blur' type='matrix' values='1 0 0 0 1  0 1 0 0 0.78  0 0 1 0 0.18  0 0 0 1 0'/>"
        "<feMerge><feMergeNode/><feMergeNode in='SourceGraphic'/></feMerge>"
        "</filter>"
        "</defs>"
        "<rect width='300' height='450' fill='#111827'/>"
        "<rect x='18' y='18' width='264' height='414' rx='18' fill='none' stroke='#facc15' stroke-opacity='0.65' stroke-width='2'/>"
        f"<text x='150' y='224' fill='#fff7cc' filter='url(#glow)' font-family='Arial, sans-serif' font-size='22' font-weight='700' text-anchor='middle'>"
        f"{label}</text>"
        "</svg>"
    )
    return "data:image/svg+xml;charset=UTF-8," + quote(svg)


def _load_df():
    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset missing: {DATASET_PATH}")

    df = pd.read_csv(DATASET_PATH, encoding="utf-8-sig", on_bad_lines="skip")
    df.columns = [c.strip() for c in df.columns]
    return df


def _build_movie_index():
    global _movie_index, _movie_index_mtime

    if not DATASET_PATH.exists():
        raise FileNotFoundError(f"Dataset missing: {DATASET_PATH}")

    mtime = DATASET_PATH.stat().st_mtime
    if _movie_index is not None and _movie_index_mtime == mtime:
        return _movie_index

    df = _load_df()

    title_col = _col(df, "Movie Name", "Title", "title", "name")
    lang_col = _col(df, "Language", "language")
    genre_col = _col(df, "Genre", "Genres", "listed_in", "Listed In")
    desc_col = _col(df, "Plot", "Description", "description", "Synopsis")
    year_col = _col(df, "Year of Release", "Year", "release_year")
    rating_col = _col(df, "IMDb Rating", "Rating", "rating")

    if not title_col or not lang_col:
        raise ValueError("Dataset missing required columns")

    work = pd.DataFrame()
    work["title"] = df[title_col].map(_clean)
    work["language"] = df[lang_col].map(_canonical_language)
    work["genre"] = df[genre_col].map(_clean) if genre_col else ""
    work["plot"] = df[desc_col].map(_clean) if desc_col else ""
    work["year"] = df[year_col].map(lambda value: _year_value(_clean(value))) if year_col else ""
    work["rating"] = df[rating_col].map(_clean) if rating_col else ""
    work = work[(work["title"] != "") & (work["language"] != "")]
    work["_title_key"] = work["title"].map(_title_key)
    work["_movie_key"] = work["_title_key"] + "|" + work["year"].fillna("")

    english_movie_keys = set(work.loc[work["language"] == "English", "_movie_key"])

    blob = (
        work["title"].fillna("") + " " +
        work["genre"].fillna("") + " " +
        work["plot"].fillna("")
    ).str.lower()

    work["_rating_num"] = pd.to_numeric(work["rating"], errors="coerce").fillna(0)

    indexed = {}

    for language in VALID_LANGUAGES:
        lang_df = work[work["language"] == language].copy()
        if language != "English":
            lang_df = lang_df[~lang_df["_movie_key"].isin(english_movie_keys)]

        lang_blob = blob.loc[lang_df.index]

        for emotion, keywords in EMOTION_KEYWORDS.items():
            scores = pd.Series(0, index=lang_df.index)

            for keyword in keywords:
                scores = scores + lang_blob.str.count(keyword)

            result = lang_df.assign(_score=scores)
            result = result[result["_score"] > 0]
            result = result.drop_duplicates(subset=["title"])
            result = result.sort_values(by=["_score", "_rating_num"], ascending=False)

            indexed[(emotion, language)] = result.to_dict("records")

    _movie_index = indexed
    _movie_index_mtime = mtime
    return _movie_index


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/movies")
def movies():
    emotion = (request.args.get("emotion") or "").lower().strip()
    language = (request.args.get("language") or "").strip()

    try:
        page = max(1, int(request.args.get("page", 1)))
    except ValueError:
        page = 1

    if emotion not in EMOTION_KEYWORDS:
        return jsonify({"error": "Invalid emotion"}), 400

    if language not in VALID_LANGUAGES:
        return jsonify({"error": "Invalid language"}), 400

    try:
        movie_index = _build_movie_index()
    except FileNotFoundError as error:
        return jsonify({"error": str(error)}), 500
    except ValueError as error:
        return jsonify({"error": str(error)}), 500

    matched_movies = movie_index.get((emotion, language), [])
    total = len(matched_movies)
    total_pages = max(1, math.ceil(total / PER_PAGE))

    page = min(page, total_pages)
    start = (page - 1) * PER_PAGE
    page_movies = matched_movies[start:start + PER_PAGE]

    results = []

    for row in page_movies:
        title = row.get("title", "Unknown")

        results.append({
            "title": title,
            "genre": row.get("genre", ""),
            "year": row.get("year", ""),
            "rating": row.get("rating", ""),
            "language": row.get("language", ""),
            "poster": _poster_placeholder(title),
        })

    return jsonify({
        "movies": results,
        "current_page": page,
        "total_pages": total_pages,
        "total": total,
    })


if __name__ == "__main__":
    app.run(debug=True)