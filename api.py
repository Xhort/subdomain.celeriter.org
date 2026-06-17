from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ 
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://celeriter.org",
    "https://www.celeriter.org",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def home():
    return {"message": "FastAPI chatbot server is running"}


# uvicorn api:app --reload
#   const response = await fetch("https://chatbot-api.celeriter.org/chat", {