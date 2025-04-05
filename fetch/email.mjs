import { Resend } from "resend";
import dotenv from "dotenv";

dotenv.config();

import { databaseConnection } from "../database/connect.js";

const collections = await databaseConnection();
const users = await collections.users
  .find({ notify: true }, { projection: { email: 1, _id: 0 } })
  .toArray();

const resend = new Resend(process.env.RESEND_API_KEY);

const { _data, error } = await resend.batch.send(
  users.map((user) => ({
    from: "Snublejuice <varsling@snublejuice.no>",
    to: [user.email],
    subject: "Ny måned; nye priser!",
    html: `
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>Ny måned - Snublejuice</title>
          <style>
            @font-face {
              font-family: "fixedsys";
              font-style: normal;
              font-weight: normal;
              src: url("https://raw.githubusercontent.com/hallvardnmbu/snublejuice/main/public/fonts/fixedsys.woff")
                format("woff");
              -webkit-font-smoothing: none;
              font-smooth: never;
            }

            html,
            body {
              height: 100%;
              margin: 0;
              padding: 0;
            }

            body {
              font-family: "fixedsys", monospace;
              color: #000000;
              line-height: 1.2rem;
              font-size: 1rem;

              display: flex;
              flex-direction: column;
              align-items: center;
              padding: 10px;
              text-align: center;
              min-height: 100vh;
              box-sizing: border-box;
            }
            body h1 {
              font-size: 1.2rem;
            }
            body hr {
              border: none;
              border-top: 10px solid #cccccc;
              width: 100%;
            }
            body menu,
            body footer {
              display: flex;
              justify-content: center;
              align-items: center;
              align-self: center;
              gap: 10px;

              list-style: none;

              padding: 0;
              margin: 0;

              color: #666666;
            }
            body div {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              width: 100%;
            }
            footer {
              margin-top: auto;
              width: 100%;
            }
            body menu img {
              width: 75px;
              height: auto;
            }
            body p {
              margin: 5px;
              max-width: 60%;
            }
            a,
            a:visited {
              color: #666666;
              text-decoration-thickness: 2px;
            }
            a:hover {
              color: #000000;
            }

            @media (max-width: 500px) {
              body menu {
                flex-direction: column;
              }
            }
          </style>
        </head>
        <body>
          <div>
            <p>
            <h1>Nå er det endelig ny måned med nye tilbud!</h1>
            </p>

            <hr />

            <menu class="landing-menu">
              <li>
                <a href="https://vinmonopolet.snublejuice.no"
                  >vinmonopolet.snublejuice.no</a
                >
              </li>
              <li>
                <img
                  src="https://raw.githubusercontent.com/hallvardnmbu/snublejuice/main/public/images/snublejuice.png"
                  alt="SNUBLEJUICE.no"
                />
              </li>
              <li>
                <a href="https://taxfree.snublejuice.no">taxfree.snublejuice.no</a>
              </li>
            </menu>

            <hr />

            <p>
              Nå er nettsiden akkurat oppdatert med denne måneds priser, med
              oppdaterte lagerbeholdninger av de rabatterte produktene.
            </p>

            <p>
              Spaser bort til
              <a href="https://vinmonopolet.snublejuice.no"
                >vinmonopolet.snublejuice.no</a
              >
              for å se de nyeste tilbudene.
            </p>
            <p>
              Om du skal ut å fly så kan det også være verdt å ta en titt på
              <a href="https://taxfree.snublejuice.no">taxfree.snublejuice.no</a>.
            </p>
          </div>

          <footer>
            <p>
              Dersom du ikke ønsker disse varslingene, så kan du melde deg av i
              profilen din på
              <a href="https://snublejuice.no">nettsiden</a> ved å trykke på
              brukernavnet ditt øverst.
            </p>
          </footer>
        </body>
      </html>
    `,
  })),
);

if (error) {
  return console.error({ error });
}
