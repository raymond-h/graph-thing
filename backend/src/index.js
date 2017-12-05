import http from 'http';

import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import socketIo from 'socket.io';
import r from 'rethinkdb';

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

async function main() {
    const conn = await r.connect('localhost');

    app.context.db = conn;

    const server = http.createServer(app.callback());
    const io = socketIo(server);

    app.context.io = io;

    const cursor = await r.db('graphthing').table('values').changes().run(conn);

    cursor.each((err, row) => {
        const graph = row.new_val ? row.new_val.graph : (row.old_val && row.old_val.graph);
        io.to(`data-${graph}`).emit('update', row);
    });

    io.on('connection', socket => {
        console.log('new connection', socket.id);

        socket.on('fetch', async (id, ack) => {
            const cursor = await r.db('graphthing').table('values')
                .filter(
                    r.row('graph').eq(id)
                )
                .run(conn);

            const data = await cursor.toArray();

            ack(data);
        });

        socket.on('subscribe', (id, ack) => {
            console.log(`${socket.id} subscribed to ${id}`);
            socket.join(`data-${id}`, ack);
        });

        socket.on('unsubscribe', (id, ack) => {
            console.log(`${socket.id} unsubscribed from ${id}`);
            socket.leave(`data-${id}`, ack);
        });
    });

    server.listen(process.env.PORT || 3000);
}

main()
    .catch(console.error);
