from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from chatbot import get_bot_response


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

class ChatRequest(BaseModel):
    message: str

@app.get("/")
def home():
    return {"message": "FastAPI chatbot server is running"}

@app.post("/chat")
def chat(request: ChatRequest):
    reply = get_bot_response(request.message)
    return {"reply": reply}


# uvicorn api:app --reload
#   const response = await fetch("https://chatbot-api.celeriter.org/chat", {