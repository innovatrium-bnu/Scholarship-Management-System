# Deploying to the Lightsail server

The instance is a Debian box in `ap-southeast-1a` (Singapore) — 2 GB RAM,
2 vCPU, 60 GB SSD — at **13.228.77.85**, username **`admin`**.

Three files do the work:

| File                       | Runs on    | When                                   |
| -------------------------- | ---------- | -------------------------------------- |
| `bootstrap-server.sh`      | the server | once, before the first deploy          |
| `docker-compose.prod.yml`  | the server | read by `deploy.sh`, never run by hand |
| `deploy.sh`                | your PC    | every deploy                           |

---

## 1. Where the Lightsail `.pem` key goes

**Put it here:**

```
C:\Users\LENOVO\.ssh\lightsail-bnu.pem
```

Download it from the Lightsail console — the **Download default key** link on
the instance's Connect tab, the one in your screenshot — and move it there.
Rename it to `lightsail-bnu.pem`; the downloaded name is usually something like
`LightsailDefaultKey-ap-southeast-1.pem`.

**Not inside this repository.** `.gitignore` already refuses `*.pem`, so a
stray `git add .` cannot commit it, but a private key in a project folder gets
copied around with the project. `~/.ssh` is where it belongs and where every
SSH tool looks by default. `deploy.sh` also excludes `*.pem` from the upload,
so it cannot reach the server either.

### Lock the permissions down, or Windows will refuse it

Windows OpenSSH rejects a key that other accounts can read. The error is
`UNPROTECTED PRIVATE KEY FILE` and it will not connect until this is fixed.
Run in **PowerShell**:

```powershell
icacls "C:\Users\LENOVO\.ssh\lightsail-bnu.pem" /inheritance:r
icacls "C:\Users\LENOVO\.ssh\lightsail-bnu.pem" /grant:r "$env:USERNAME:(R)"
```

The first command strips inherited permissions, the second grants read to you
alone. `chmod 400` does nothing useful on Windows — these two are the
equivalent.

### Then add the host entry

Create or edit `C:\Users\LENOVO\.ssh\config` and add:

```sshconfig
Host bnu-lightsail
    HostName 13.228.77.85
    User admin
    IdentityFile C:\Users\LENOVO\.ssh\lightsail-bnu.pem
    ServerAliveInterval 60
```

Check it:

```bash
ssh bnu-lightsail
```

The first connection asks you to confirm the host fingerprint. Every script
here refers to the machine as `bnu-lightsail`, so once this works, nothing else
needs the IP address written into it.

> **If the instance is ever stopped and started, its public IP changes** unless
> you attach a static IP. Attach one in the Lightsail console under Networking
> — it is free while it is attached to a running instance — or expect to edit
> `HostName` above after every restart.

---

## 2. Open the ports

In the Lightsail console, **Networking → IPv4 Firewall**, make sure these
exist:

| Application | Protocol | Port |
| ----------- | -------- | ---- |
| SSH         | TCP      | 22   |
| HTTP        | TCP      | 80   |

**Do not open 1521.** That is the Oracle listener. The production overlay
already stops publishing it, so the database is reachable only from the API
container over the compose network — but an open firewall rule plus any future
change that republishes the port would put an Oracle listener on the public
internet.

The instance is dual-stack, so if you use the IPv6 firewall tab as well, mirror
the same two rules there.

---

## 3. Prepare the server, once

```bash
ssh bnu-lightsail 'mkdir -p /srv/bnu-scholarships'
scp -r deploy bnu-lightsail:/srv/bnu-scholarships/
ssh bnu-lightsail 'sudo bash /srv/bnu-scholarships/deploy/bootstrap-server.sh'
```

That installs Docker, creates a 4 GB swapfile, caps container logs, and makes
`/srv/bnu-scholarships` writable by `admin`. It is safe to run twice.

Then **log out and back in** — the script adds `admin` to the `docker` group
and group membership only applies to a new login.

---

## 4. Deploy

From the repository root on your own machine:

```bash
bash deploy/deploy.sh                # code only, leaves the data alone
SEED=1 bash deploy/deploy.sh         # ...and seed the demo register
FRESH=1 SEED=1 bash deploy/deploy.sh # ...after DROPPING the schema first
```

What it does, in order: builds the SPA locally, rsyncs everything except
`node_modules`, `.git`, `qa/`, `handover/` and any key file, brings the stack
up, runs Composer and migrations, and then **checks the public URL actually
answers** — a 200 on `/`, an `#root` element in the HTML, and a 204 on
`/sanctum/csrf-cookie`.

That last check is there for a reason. The last time this project shipped a
broken build, every container was healthy and every test was green while the
browser got a blank page. A deploy that cannot prove the site loads has not
finished.

**The first run takes 10–15 minutes.** Oracle is starting for the first time.
That is not a hang.

### What the flags mean

- **No flag** — migrations run, data is left alone. This is the everyday one.
- **`SEED=1`** — inserts the 2,000-student demo register. `DemoSeeder` refuses
  to run under `APP_ENV=production`, so the script passes `APP_ENV=local` for
  that one command. That guard is deliberate: it is what stops a bare
  `db:seed` inserting 2,000 invented students into a real register.
- **`FRESH=1`** — drops every table first. **This destroys all data.**

---

## 5. Afterwards

Sign in at `http://13.228.77.85/`. If you seeded, the four demo accounts are
`super.admin@`, `admin@`, `data.entry@` and `reporting@` at `bnu.edu.pk`,
password `changeme`.

**Change those passwords, or do not seed on a server that is reachable from the
internet.** They are published in this repository.

### Watching it

```bash
ssh bnu-lightsail
cd /srv/bnu-scholarships
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml logs -f api
docker compose -f docker-compose.yml -f deploy/docker-compose.prod.yml ps
free -h          # how hard the swap is working
```

### Reaching Oracle from your machine

The listener is not published, which is the point. Tunnel to it instead:

```bash
ssh -L 1521:localhost:1521 bnu-lightsail
```

---

## 6. Things that will bite

| Symptom                                             | Cause                                                                       | Fix                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `UNPROTECTED PRIVATE KEY FILE`                      | Windows ACLs on the `.pem` are too loose                                    | The two `icacls` commands in §1                                                           |
| Every API call answers 500 mentioning `laravel.log` | `artisan` ran as root and left a root-owned log php-fpm cannot write        | `deploy.sh` re-runs the `chown` each time; run it again                                   |
| `/sanctum/csrf-cookie` returns 200 and HTML         | nginx is answering it instead of Laravel                                    | The `location /sanctum` block is missing from `docker/nginx.conf`                         |
| Oracle never becomes healthy, container restarts    | Out of memory                                                               | Check `free -h`; the swapfile is what makes 2 GB workable, so confirm bootstrap ran        |
| `ORA-00845`                                         | `/dev/shm` too small for the SGA                                            | `shm_size: 1gb` in the prod overlay — check it was not lost by a compose file edit        |
| Deploy hangs on `npm ci`                            | Running it on the server rather than locally                                | `deploy.sh` builds locally on purpose; the server has no Node and needs none              |
| Site loads but every write fails with 419           | The session cookie is being issued for a different host than the browser's  | `APP_URL` in `api/.env` on the server must match the address you are visiting             |

---

## 7. An honest note about this instance

2 GB of RAM is below what Oracle XE alone is comfortable with, and it is
sharing with php-fpm, nginx and Docker. The swapfile makes it work, and it will
demonstrate the system perfectly well.

For BNU to actually run this, two things should change: the instance wants
4 GB, and the database should be BNU's own Oracle 19c rather than XE 18c in a
container. The schema has been written and verified against 18c precisely so
that it is portable upward — everything 18c accepts, 19c accepts — but only
their server can confirm their character set, their `COMPATIBLE` setting and
the privileges the application is granted.

There is also no TLS here. Sign-in credentials cross the internet in the clear
over `http://`. Before this is used by anyone real, put a domain in front of it
and terminate TLS — Caddy or certbot on the same box is a small change to
`docker/nginx.conf` and one more container.
