How to Start Working
Clone the repo: git clone [https://github.com/ValeriSKirilov/grocery-tracker.git](https://github.com/ValeriSKirilov/grocery-tracker.git)

Copy the environment file: Copy .env.example and rename the copy to .env.

Start the environment: Open your terminal in the root folder and run:
docker compose up --build

Start Coding:

Backend: Edit files in /backend. The API will auto-reload. View the API documentation at http://localhost:8000/docs.
*Note: if localhost:8000 doesn't work, run "hostname -I" (in Linux, google Windows equivalent) and try using the first IP in locahost's place.*

Frontend: Open /frontend/index.html directly in your browser or use VS Code "Live Server".