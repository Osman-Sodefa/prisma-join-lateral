import { v4 as uuid } from "uuid";
import { Post, PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

const USERS_TO_CREATED = 100;
const POSTS_TO_CREATE_PER_USER = 10_000;
const POSTS_PER_USER_TO_FETCH = 3;

const start = async () => {
  // clear existing data
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();

  // create some random data
  const newUsers = Array.from({ length: USERS_TO_CREATED }, () => ({
    id: uuid(),
  }));
  await prisma.user.createMany({
    data: newUsers,
  });

  const now = new Date().getTime();
  await Promise.all(
    newUsers.map(async (user) => {
      const posts = Array.from({ length: POSTS_TO_CREATE_PER_USER }, () => ({
        userId: user.id,
        createdAt: new Date(Math.floor(Math.random() * now)),
      }));
      await prisma.post.createMany({ data: posts });
    })
  );

  console.time("find many be lateral join");
  const [users, posts] = await Promise.all([
    prisma.user.findMany({
      orderBy: {
        id: "asc",
      },
    }),
    prisma.$queryRaw`
      SELECT
        o.*
      FROM
        "User" u
      JOIN LATERAL (
        SELECT
          *
        FROM
          "Post" p
        WHERE
          u."id" = p."userId"
        ORDER BY
          p."createdAt" DESC
        LIMIT ${POSTS_PER_USER_TO_FETCH}
      ) o ON true
  ` as unknown as Promise<Post[]>,
  ]);

  const postsMap = posts.reduce((map, post) => {
    const { userId } = post;
    if (!map.has(userId)) {
      map.set(userId, []);
    }
    map.get(userId)?.push(post);
    return map;
  }, new Map<User["id"], Post[]>());

  const usersWithPostsLateral = users.map((user) => ({
    ...user,
    posts: postsMap.get(user.id) ?? [],
  }));

  console.timeEnd("find many be lateral join");

  console.time("find many by include");
  const usersWithPostsInclude = await prisma.user.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      posts: {
        take: POSTS_PER_USER_TO_FETCH,
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
  console.timeEnd("find many by include");

  console.log(
    "same result?",
    JSON.stringify(usersWithPostsInclude) ===
      JSON.stringify(usersWithPostsLateral)
  );
};

start();
