import Koa from 'koa';

const app = new Koa();

app.use(async ctx => {
    ctx.body = 'Hello world from Koa!!';
});

app.listen(process.env.PORT || 3000);
