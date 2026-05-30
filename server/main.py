from fastapi import FastAPI
from server.api.router import api_router

app = FastAPI(title="World of Promptcraft API")

app.include_router(api_router, prefix="/api")


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
