import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import socketIo from 'socket.io';
import r from 'rethinkdb';
import parseRethinkDbUrl from 'parse-rethinkdb-url';

const app = new Koa();
const router = new Router();

app.use(bodyParser());

router.get('/test', async ctx => {
    ctx.body = `Hello world from Koa!! URL: ${ctx.url}`;
});

router.post('/update/:id', async ctx => {
    await r.db('graphthing').table('values').insert({
        graph: ctx.params.id,
        value: Number(ctx.request.body.value),
        time: new Date()
    }).run(ctx.db);

    ctx.body = { ok: true };
});

router.get('/graph-data/:id', async ctx => {
    const cursor = await r.db('graphthing').table('values')
        .filter(
            r.row('graph').eq(ctx.params.id)
        )
        .run(ctx.db);

    ctx.body = await cursor.toArray();
});

app
    .use(router.routes())
    .use(router.allowedMethods());

function dbCreateIfNotExists(r, dbNames) {
    return r.expr(dbNames)
        .difference(r.dbList())
        .forEach(dbName => r.dbCreate(dbName));
}

function tableCreateIfNotExists(r, dbName, tableNames) {
    return r.expr(tableNames)
        .difference(r.db(dbName).tableList())
        .forEach(tableName => r.db(dbName).tableCreate(tableName));
}

async function main() {
    const conn = await r.connect(
        (process.env.RETHINKDB_URL != null) ?
            parseRethinkDbUrl(process.env.RETHINKDB_URL) :
            process.env.RETHINKDB_HOST
    );

    app.context.db = conn;

    await dbCreateIfNotExists(r, ['graphthing']).run(conn);
    await tableCreateIfNotExists(r, 'graphthing', ['values']).run(conn);

    const server = http.createServer(app.callback());
    const io = socketIo(server);

    app.context.io = io;

    io.on('connection', socket => {
        console.log('new connection', socket.id);

        socket.on('fetch', async (id, ack) => {
            const cursor = await r.db('graphthing').table('values')
                .filter({ graph: id })
                .orderBy('time')
                .run(conn);

            const data = await cursor.toArray();

            ack(data);
        });

        socket.on('subscribe', async (id, ack) => {
            console.log(`${socket.id} subscribed to ${id}`);

            let cursor;

            const unsub = async unsubId => {
                if(unsubId !== id) {
                    return;
                }

                console.log(`${socket.id} unsubscribed from ${id}`);

                if(cursor == null) {
                    throw new Error(`unsubscribe(id: ${id}), from: ${socket.id}: Cursor not initialized`);
                }

                await cursor.close();
            };

            socket.on('unsubscribe', (id, ack) => unsub(id).then(ack));
            socket.on('disconnect', () => unsub(id));

            cursor = await r.db('graphthing')
                .table('values')
                .filter({ graph: id })
                .changes()
                .run(conn);

            cursor.each((err, row) => {
                socket.emit('update', row);
            });

            ack();
        });
    });

    server.listen(process.env.PORT || 3000);
}

main()
    .catch(console.error);
