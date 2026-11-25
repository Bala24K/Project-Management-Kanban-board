# Deploying to AWS (beginner guide)

This guide deploys the app as:

- **one EC2 virtual server**, which runs the app in Docker and serves both the API and the website, and
- **one RDS PostgreSQL database**, managed by AWS.

You only need a web browser. You never have to install anything on your own computer, because the server terminal runs in the browser.

Expect about 30–40 minutes, most of it waiting for AWS. On the free plan this is covered by your credits.

> **Before you start:** your code must be on GitHub. If the repo is **private**, the easiest option is to make it public for the clone step (*GitHub repo → Settings → Change visibility*).

---

## Step 0: Pick the region

AWS runs data centres in many "regions" around the world. On the **free plan your account is locked to one region**, the one shown on the EC2 dashboard ("You are using the following Amazon EC2 resources in the **Asia Pacific (Sydney)** Region"). Switching regions is a paid feature, so just use that region.

You don't need to do anything here. Create everything below in that same region, which AWS does automatically.

---

## Step 1: Create the server (EC2)

1. In the top search bar, type **EC2** and open it. Click **Launch instance**.
2. **Name:** `flowboard-server`
3. **Application and OS Images:** leave **Amazon Linux 2023** selected (the default).
4. **Instance type:** choose `t3.micro`, or any type marked **Free tier eligible**.
5. **Key pair:** choose **Proceed without a key pair**. You'll connect through the browser instead.
6. **Network settings:** tick both of these:
   - ✅ **Allow SSH traffic from** → Anywhere. This is what lets the browser terminal connect.
   - ✅ **Allow HTTP traffic from the internet.** This is what lets people open your website.
7. **Configure storage:** change `8` GiB to **20** GiB.
8. Click **Launch instance**, then **View all instances**. Wait until **Instance state** shows **Running**.

---

## Step 2: Create the database (RDS)

1. Search for **RDS** and open it. Click **Create database**.
2. Choose **Standard create**, then the engine **PostgreSQL**. Leave the default 16.x or 17.x version.
3. **Templates:** choose **Free tier**.
4. **Settings:**
   - **DB instance identifier:** `flowboard-db`
   - **Master username:** `postgres`
   - **Credentials management:** **Self managed**
   - **Master password:** use **letters and numbers only**, e.g. `Flowboard2026Secret`. Symbols like `@ : / ? # %` break the connection URL. **Write it down.**
5. **Instance configuration:** `db.t4g.micro` or `db.t3.micro`.
6. **Storage:** 20 GiB. Untick **Enable storage autoscaling**.
7. **Connectivity:** choose **Connect to an EC2 compute resource**, then select **flowboard-server**. AWS then sets up the firewall rules between the server and the database for you. Leave **Public access** set to **No**.
8. Expand **Additional configuration** near the bottom and set **Initial database name** to `flowboard`. This step is important.
9. Click **Create database**. It takes about 5–10 minutes. Wait until **Status** shows **Available**.
10. Click `flowboard-db`. On the **Connectivity & security** tab, copy the **Endpoint**. It looks like `flowboard-db.abc123xyz.ap-southeast-2.rds.amazonaws.com`.

---

## Step 3: Open a terminal on the server

1. Go to **EC2 → Instances**, tick `flowboard-server`, and click **Connect** at the top.
2. On the **EC2 Instance Connect** tab, click **Connect**. A black terminal opens in a new browser tab.

Paste the commands below into that terminal, one block at a time. Right-click → Paste, or Ctrl+Shift+V.

---

## Step 4: Install Docker and Git

```bash
sudo dnf install -y docker git
sudo systemctl enable --now docker
```

Then add 2 GB of swap. Without it, the small server can run out of memory while building:

```bash
sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
```

---

## Step 5: Download and build the app

```bash
git clone https://github.com/Bala24K/Project-Management-Kanban-board.git flowboard
cd flowboard
sudo docker build -t flowboard .
```

The build takes about 3–6 minutes and ends with `naming to docker.io/library/flowboard`.

---

## Step 6: Save the settings

Create a settings file. **Replace `YOUR_PASSWORD` and `YOUR_ENDPOINT`** with the values from Step 2:

```bash
cat > ~/flowboard.env <<'EOF'
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@YOUR_ENDPOINT:5432/flowboard?schema=public&sslmode=require
FAILURE_SIMULATION=true
EOF
```

- Don't put quotes around the values. Docker would treat the quotes as part of the value.
- `sslmode=require` is needed because AWS databases only accept encrypted connections.
- `FAILURE_SIMULATION=true` shows the "Simulate API failures" switch, so reviewers can see rollback. Writes only fail when someone turns it on.

---

## Step 7: Start the app

```bash
sudo docker run -d --name flowboard --restart unless-stopped -p 80:4000 --env-file ~/flowboard.env flowboard
sudo docker logs -f flowboard
```

Wait until you see:

```text
All migrations have been successfully applied.      (first start; later starts say "No pending migrations to apply.")
[api] listening on :4000 (failure simulation: on)
```

Press **Ctrl+C** to stop watching the logs. The app keeps running, and it restarts automatically if the server reboots.

---

## Step 8: Open it

1. Go to **EC2 → Instances → flowboard-server** and copy the **Public IPv4 address**.
2. In your browser, go to **`http://<that-address>`**. Type `http://` yourself; there's no HTTPS, so the browser will say "Not secure". That's expected.
3. Check `http://<that-address>/api/health`. It should return `{"ok":true,...}`.
4. Open the site in **two browser windows**, or one normal and one private. Create a task in one, and it should appear in the other immediately.
5. Put this URL in the README under **Live app**, or do Step 9 first and use the HTTPS domain instead.

> **Optional, but recommended before you submit:** the public IP changes if the server is stopped and started again. To keep it fixed, go to **EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**, then **Actions → Associate Elastic IP address**, and pick `flowboard-server`. Use the Elastic IP as your URL.

---

## Step 9 (optional): Add a domain name and HTTPS

HTTPS certificates are issued for domain names, not bare IP addresses, so you need a name first.

1. **Fix the IP address.** Go to **EC2 → Elastic IPs → Allocate Elastic IP address → Allocate**. Then select the new IP → **Actions → Associate Elastic IP address**, and pick the instance from the dropdown (`i-…` / `flowboard-server`). Your server now uses this new IP.
2. **Get a free domain.** Sign in at **duckdns.org**, add a subdomain (e.g. `flowboard-bala`), set **current ip** to your Elastic IP, and click **update ip**.
3. **Open port 443.** Go to **EC2 → Instances → flowboard-server → Security tab** and click the security group (`launch-wizard-1`). Choose **Edit inbound rules → Add rule**, set Type **HTTPS** and Source **Anywhere-IPv4**, and save. Keep the **HTTP** rule: you should end up with exactly one HTTP, one HTTPS and one SSH rule.
4. **Put Caddy in front of the app.** Replace the domain with yours:
   ```bash
   sudo docker rm -f flowboard
   sudo docker run -d --name flowboard --restart unless-stopped -p 127.0.0.1:4000:4000 --env-file ~/flowboard.env flowboard
   sudo docker run -d --name caddy --restart unless-stopped --network host -v caddy_data:/data caddy:2 \
     caddy reverse-proxy --from flowboard-bala.duckdns.org --to localhost:4000
   sudo docker logs -f caddy       # wait for "certificate obtained successfully", then Ctrl+C
   ```
5. Open **https://your-name.duckdns.org**. You'll see a padlock, and `http://` redirects to `https://`. After this, the bare IP address no longer serves the site; use the domain.

---

## Updating after you push new code

From the EC2 terminal (Step 3), rebuild and restart only the app container. Caddy keeps running.

```bash
cd ~/flowboard && git pull
sudo docker build -t flowboard .
sudo docker rm -f flowboard
# With Caddy (Step 9 done):
sudo docker run -d --name flowboard --restart unless-stopped -p 127.0.0.1:4000:4000 --env-file ~/flowboard.env flowboard
# Without Caddy, use -p 80:4000 instead of -p 127.0.0.1:4000:4000
```

Changes that only touch documentation (README, docs) don't need a redeploy.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Browser can't open the page | Use `http://`, not `https://`. Check that the instance's security group allows **HTTP (port 80)**: EC2 → Instances → Security tab. |
| `sudo docker ps` shows nothing; the container stopped | Run `sudo docker logs flowboard` and match the error below. |
| `P1001: Can't reach database server` | The endpoint is wrong, or the database wasn't linked to the server in Step 2.7. In RDS → `flowboard-db` → **Actions → Set up EC2 connection**, choose `flowboard-server`. |
| `P1000: Authentication failed` | The password in `~/flowboard.env` is wrong. Fix it, then run the `docker rm -f` and `docker run` commands again. |
| `Database "flowboard" does not exist` | You skipped Step 2.8. Change `/flowboard?` to `/postgres?` in `~/flowboard.env` and restart the container. |
| An error mentioning SSL / `no pg_hba.conf entry … no encryption` | Make sure the URL ends with `&sslmode=require`. |
| The build stops with `Killed` or exit code 137 | The server ran out of memory. Do the swap step in Step 4, then rebuild. |

---

## Cost and cleanup

The server, the database and a public IP use a small part of the free-plan credits. When you no longer need the deployment, delete it so it stops using credits:

1. **RDS → flowboard-db → Actions → Delete.** Untick "create final snapshot".
2. **EC2 → Instances → flowboard-server → Instance state → Terminate.**
3. If you created an Elastic IP, release it: **EC2 → Elastic IPs → Actions → Release**.
